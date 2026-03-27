import React, { useState, useEffect, useRef } from "react";
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  History, 
  Settings, 
  Loader2, 
  Camera,
  Trash2,
  ChevronRight,
  Download,
  Eye,
  XCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { pdfToImages } from "./lib/pdf";
import { analyzeExamSheet } from "./lib/gemini";
import * as db from "./lib/supabase";
import { Database, CloudOff } from "lucide-react";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Exam {
  id: string;
  name: string;
  description: string;
  num_questions: number;
  passing_score: number;
  penalty: number;
  answer_key: string; // JSON string
  created_at: string;
}

interface Result {
  id: string;
  exam_id: string;
  candidate_number: string;
  answers: string; // JSON string
  score: number;
  max_score: number;
  is_passing: boolean;
  confidence: number;
  created_at: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"correct" | "history" | "settings" | "detail">("correct");
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [currentResult, setCurrentResult] = useState<any>(null);
  const [answerKey, setAnswerKey] = useState<Record<string, string>>({});
  const [newExamName, setNewExamName] = useState("");
  const [csvPreview, setCsvPreview] = useState<Record<string, string> | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [dbStatus, setDbStatus] = useState<"supabase" | "local">("local");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setApiKeySet(!!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY");
    setDbStatus(db.isSupabaseConfigured ? "supabase" : "local");
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const examsData = await db.getExams();
      if (examsData.length === 0) {
        const defaultId = crypto.randomUUID();
        const defaultKey: Record<string, string> = {};
        for (let i = 1; i <= 100; i++) defaultKey[i.toString()] = "A";
        
        const defaultExam: Exam = {
          id: defaultId,
          name: "Sample Exam #1",
          description: "Initial testing session",
          num_questions: 100,
          passing_score: 60,
          penalty: 0,
          answer_key: JSON.stringify(defaultKey),
          created_at: new Date().toISOString()
        };
        await db.saveExam(defaultExam);
      }
      fetchExams();
    };
    initialize();
  }, []);

  const deleteExam = async (id: string) => {
    if (!confirm("Are you sure you want to delete this exam and all its results?")) return;
    
    try {
      await db.deleteExamData(id);
      fetchExams();
      if (selectedExamId === id) {
        setSelectedExamId("");
      }
    } catch (err) {
      console.error("Failed to delete exam", err);
    }
  };

  const deleteResult = async (id: string) => {
    if (!confirm("Are you sure you want to delete this result?")) return;
    
    try {
      await db.deleteResultData(id);
      fetchResults(selectedExamId);
    } catch (err) {
      console.error("Failed to delete result", err);
    }
  };

  const exportCSV = () => {
    if (results.length === 0) return;
    
    const headers = ["Date", "Candidate Number", "Score", "Max Score", "Status", "Confidence"];
    const rows = results.map(r => [
      new Date(r.created_at).toLocaleDateString(),
      r.candidate_number,
      r.score,
      r.max_score,
      r.is_passing ? "PASS" : "FAIL",
      r.confidence ? (r.confidence * 100).toFixed(1) + "%" : "N/A"
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `results_${selectedExamId}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    if (selectedExamId) {
      fetchResults(selectedExamId);
      const exam = exams.find(e => e.id === selectedExamId);
      if (exam) {
        try {
          setAnswerKey(JSON.parse(exam.answer_key));
        } catch (e) {
          console.error("Failed to parse answer key for exam:", exam.id, e);
          setAnswerKey({});
        }
      }
    }
  }, [selectedExamId, exams]);

  const fetchExams = async () => {
    try {
      const data = await db.getExams();
      setExams(data);
      if (data.length > 0 && !selectedExamId) {
        setSelectedExamId(data[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch exams", err);
    }
  };

  const fetchResults = async (examId: string) => {
    if (!examId) return;
    try {
      const data = await db.getResults(examId);
      setResults(data);
    } catch (err) {
      console.error("Failed to fetch results", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedExamId) return;

    setIsUploading(true);
    setUploadProgress("Processing files...");

    try {
      const storedResults = localStorage.getItem("results");
      let allResults: Result[] = [];
      try {
        allResults = storedResults ? JSON.parse(storedResults) : [];
      } catch (e) {
        console.error("LocalStorage corruption detected, resetting results:", e);
        localStorage.removeItem("results");
      }

      const currentExam = exams.find(e => e.id === selectedExamId);
      if (!currentExam) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Processing ${file.name}...`);
        
        let images: string[] = [];
        if (file.type === "application/pdf") {
          images = await pdfToImages(file);
        } else {
          const reader = new FileReader();
          const imagePromise = new Promise<string>((resolve) => {
            reader.onload = (e) => resolve(e.target?.result as string);
          });
          reader.readAsDataURL(file);
          images = [await imagePromise];
        }

        let allExamAnswers: Record<string, string> = {};
        let candidateNumber = "Unknown";
        let totalConfidence = 0;
        let pagesAnalyzed = 0;

        for (const imageBase64 of images) {
          setUploadProgress(`Preparing page ${pagesAnalyzed + 1} of ${images.length} for AI analysis...`);
          await new Promise(resolve => setTimeout(resolve, 500));
          
          setUploadProgress(`AI is scanning page ${pagesAnalyzed + 1} of ${images.length} (this may take a few seconds)...`);
          try {
            const analysis = await analyzeExamSheet(
              imageBase64, 
              currentExam.num_questions,
              (msg) => {
                setUploadProgress(`Page ${pagesAnalyzed + 1}/${images.length}: ${msg}`);
              }
            );
            
            setUploadProgress(`Processing answers from page ${pagesAnalyzed + 1}...`);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Validate analysis result
            if (!analysis || typeof analysis !== "object" || !analysis.detected_answers) {
              console.error("Invalid AI analysis result:", analysis);
              pagesAnalyzed++;
              continue;
            }

            const numAnswersFound = Array.isArray(analysis.detected_answers) ? analysis.detected_answers.length : 0;
            console.log(`AI found ${numAnswersFound} answers on page ${pagesAnalyzed + 1}`);
            setUploadProgress(`Found ${numAnswersFound} answers on page ${pagesAnalyzed + 1}. Merging data...`);
            await new Promise(resolve => setTimeout(resolve, 500));

            // Clean and merge answers (ensure only short strings are stored)
            const cleanedAnswers: Record<string, string> = {};
            if (Array.isArray(analysis.detected_answers)) {
              analysis.detected_answers.forEach((item: any) => {
                if (item.question_number && item.selected_option && typeof item.selected_option === "string") {
                  cleanedAnswers[item.question_number.toString()] = item.selected_option.trim().charAt(0).toUpperCase();
                }
              });
            }

            allExamAnswers = { ...allExamAnswers, ...cleanedAnswers };
            
            // Use the first candidate number found or keep searching
            if (candidateNumber === "Unknown" && analysis.candidate_number && analysis.candidate_number !== "null") {
              candidateNumber = String(analysis.candidate_number).trim().substring(0, 20);
            }
            
            totalConfidence += (Number(analysis.confidence) || 0.5);
          } catch (pageError) {
            console.error(`Error analyzing page ${pagesAnalyzed + 1}:`, pageError);
            setUploadProgress(`Warning: Failed to analyze page ${pagesAnalyzed + 1}. Continuing...`);
            // Wait a moment so the user can see the warning
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          pagesAnalyzed++;
        }

        const totalAnswersFound = Object.keys(allExamAnswers).length;
        if (totalAnswersFound === 0) {
          setUploadProgress("Warning: AI could not find any answers on the sheet.");
          console.warn("AI returned 0 answers for file:", file.name);
        } else {
          setUploadProgress(`Success: Found ${totalAnswersFound} answers.`);
        }

        if (pagesAnalyzed === 0) continue;

        // Calculate score after all pages are merged
        let score = 0;
        let totalCorrect = 0;
        let totalWrong = 0;
        
        Object.keys(answerKey).forEach(q => {
          const studentAns = allExamAnswers[q];
          if (studentAns === answerKey[q]) {
            score += 1;
            totalCorrect++;
          } else if (studentAns && studentAns !== "") {
            score -= currentExam.penalty;
            totalWrong++;
          }
        });

        const maxScore = currentExam.num_questions;
        const scorePercentage = (score / maxScore) * 100;
        const isPassing = scorePercentage >= currentExam.passing_score;

        const resultId = crypto.randomUUID();
        const resultData: any = {
          id: resultId,
          exam_id: selectedExamId,
          candidate_number: candidateNumber,
          answers: JSON.stringify(allExamAnswers),
          score: parseFloat(score.toFixed(2)),
          max_score: maxScore,
          is_passing: isPassing,
          confidence: totalConfidence / pagesAnalyzed,
          created_at: new Date().toISOString(),
          total_correct: totalCorrect,
          total_wrong: totalWrong
        };

        await db.saveResult(resultData);
        setCurrentResult({ ...resultData, answers: allExamAnswers });
      }
      
      fetchResults(selectedExamId);
      setUploadProgress("Done!");
    } catch (err) {
      console.error("Upload failed with error:", err);
      setUploadProgress("Error occurred during processing. Please check console.");
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress("");
      }, 2000);
    }
  };

  const createExam = async () => {
    if (!newExamName) return;
    const id = crypto.randomUUID();
    const defaultKey: Record<string, string> = {};
    for (let i = 1; i <= 100; i++) defaultKey[i.toString()] = "A";

    try {
      const newExam: Exam = { 
        id, 
        name: newExamName, 
        description: "",
        num_questions: 100,
        passing_score: 60,
        penalty: 0,
        answer_key: JSON.stringify(defaultKey),
        created_at: new Date().toISOString()
      };
      
      await db.saveExam(newExam);
      setNewExamName("");
      fetchExams();
      setActiveTab("settings");
      setSelectedExamId(id);
    } catch (err) {
      console.error("Failed to create exam", err);
    }
  };

  const updateExamSettings = async (updates: Partial<Exam>) => {
    const exam = exams.find(e => e.id === selectedExamId);
    if (!exam) return;

    const updatedExam = { ...exam, ...updates };
    
    // If num_questions changed, adjust answer_key
    if (updates.num_questions) {
      const currentKey = JSON.parse(updatedExam.answer_key);
      const newKey: Record<string, string> = {};
      for (let i = 1; i <= updates.num_questions; i++) {
        newKey[i.toString()] = currentKey[i.toString()] || "A";
      }
      updatedExam.answer_key = JSON.stringify(newKey);
      setAnswerKey(newKey);
    }

    try {
      await db.saveExam(updatedExam);
      fetchExams();
    } catch (err) {
      console.error("Failed to update exam settings", err);
    }
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
      const newKey: Record<string, string> = {};

      // Check if it's q,answer format
      const firstLine = lines[0].toLowerCase();
      const hasHeader = firstLine.includes("q") || firstLine.includes("answer");
      const startIdx = hasHeader ? 1 : 0;

      if (lines[startIdx].includes(",")) {
        // q,answer format
        for (let i = startIdx; i < lines.length; i++) {
          const [q, ans] = lines[i].split(",");
          if (q && ans) newKey[q.trim()] = ans.trim().toUpperCase();
        }
      } else {
        // Single column format
        for (let i = startIdx; i < lines.length; i++) {
          newKey[(i - startIdx + 1).toString()] = lines[i].trim().toUpperCase();
        }
      }
      setCsvPreview(newKey);
    };
    reader.readAsText(file);
  };

  const confirmImport = () => {
    if (!csvPreview) return;
    const numQuestions = Object.keys(csvPreview).length;
    updateExamSettings({ 
      answer_key: JSON.stringify(csvPreview),
      num_questions: numQuestions
    });
    setCsvPreview(null);
  };

  const exportAnswerKeyCSV = () => {
    const sortedKeys = Object.keys(answerKey).sort((a, b) => parseInt(a) - parseInt(b));
    const csvContent = "q,answer\n" + sortedKeys.map(q => `${q},${answerKey[q]}`).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `answer_key_${selectedExamId}.csv`);
    link.click();
  };

  const clearAllData = async () => {
    if (confirm("WARNING: This will delete ALL exams and results. This action cannot be undone. Proceed?")) {
      await db.clearAll();
      window.location.reload();
    }
  };

  const updateAnswerKey = async (q: string, val: string) => {
    const newKey = { ...answerKey, [q]: val };
    setAnswerKey(newKey);
    
    const exam = exams.find(e => e.id === selectedExamId);
    if (!exam) return;

    const updatedExam = { ...exam, answer_key: JSON.stringify(newKey) };
    try {
      await db.saveExam(updatedExam);
      fetchExams();
    } catch (err) {
      console.error("Failed to update answer key", err);
    }
  };

  const totalQuestions = Object.keys(answerKey).length;
  const correctCount = currentResult ? Object.keys(answerKey).filter(q => currentResult.answers[q] === answerKey[q]).length : 0;
  const unansweredCount = currentResult ? Object.keys(answerKey).filter(q => !currentResult.answers[q]).length : 0;
  const incorrectCount = totalQuestions - correctCount - unansweredCount;

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter uppercase italic font-serif">ExamChecker AI</h1>
          <p className="text-xs opacity-50 uppercase tracking-widest mt-1">Vision-Powered OMR Engine</p>
        </div>
        <div className="flex gap-4">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1 border text-[10px] font-mono uppercase tracking-widest",
            dbStatus === "supabase" ? "border-green-600/50 text-green-600" : "border-amber-600/50 text-amber-600"
          )}>
            {dbStatus === "supabase" ? <Database size={12} /> : <CloudOff size={12} />}
            {dbStatus === "supabase" ? "Supabase Connected" : "Local Only"}
          </div>
          <select 
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="bg-transparent border border-[#141414] px-3 py-1 text-sm focus:outline-none"
          >
            {exams.map(exam => (
              <option key={exam.id} value={exam.id}>{exam.name}</option>
            ))}
          </select>
          <button 
            onClick={() => setActiveTab("settings")}
            className="p-2 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-100px)]">
        {/* Sidebar Navigation */}
        <nav className="w-full lg:w-20 border-b lg:border-b-0 lg:border-r border-[#141414] flex lg:flex-col items-center py-4 lg:py-8 gap-8 px-4 lg:px-0">
          <button 
            onClick={() => setActiveTab("correct")}
            className={cn("p-3 transition-all", activeTab === "correct" ? "bg-[#141414] text-[#E4E3E0]" : "hover:opacity-50")}
            title="Correction"
          >
            <Upload size={24} />
          </button>
          <button 
            onClick={() => setActiveTab("history")}
            className={cn("p-3 transition-all", activeTab === "history" ? "bg-[#141414] text-[#E4E3E0]" : "hover:opacity-50")}
            title="History"
          >
            <History size={24} />
          </button>
          <button 
            onClick={() => setActiveTab("settings")}
            className={cn("p-3 transition-all", activeTab === "settings" ? "bg-[#141414] text-[#E4E3E0]" : "hover:opacity-50")}
            title="Answer Key"
          >
            <FileText size={24} />
          </button>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 p-6 lg:p-12 overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeTab === "correct" && (
              <motion.div 
                key="correct"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-8">
                    <h2 className="text-4xl font-serif italic">Upload Sheets</h2>
                    <p className="opacity-70 leading-relaxed">
                      Drop your PDF scans or photos here. Gemini Vision will automatically detect the bubbles, 
                      read the candidate number, and compare with the answer key.
                    </p>

                    <div className="relative group">
                      <input 
                        type="file" 
                        multiple 
                        accept="image/*,application/pdf"
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        disabled={isUploading || !selectedExamId}
                      />
                      <div className={cn(
                        "border-2 border-dashed border-[#141414] p-12 flex flex-col items-center justify-center gap-4 transition-all",
                        isUploading ? "opacity-50" : "group-hover:bg-[#141414]/5"
                      )}>
                        {isUploading ? (
                          <Loader2 className="animate-spin" size={48} />
                        ) : (
                          <Upload size={48} />
                        )}
                        <span className="text-sm font-mono uppercase tracking-widest">
                          {isUploading ? uploadProgress : "Drag & Drop or Click"}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <button 
                        className="flex-1 border border-[#141414] py-3 uppercase text-xs font-mono tracking-widest hover:bg-[#141414] hover:text-[#E4E3E0] transition-all flex items-center justify-center gap-2"
                        onClick={() => setShowCamera(true)}
                      >
                        <Camera size={16} /> Use Camera
                      </button>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <h2 className="text-4xl font-serif italic">Live Result</h2>
                    {currentResult ? (
                      <motion.div 
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="border border-[#141414] p-8 space-y-6 bg-white shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]"
                      >
                        <div className="flex justify-between items-start border-b border-[#141414] pb-4">
                          <div>
                            <span className="text-[10px] uppercase opacity-50 font-mono">Candidate</span>
                            <p className="text-2xl font-mono font-bold">#{currentResult.candidate_number}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] uppercase opacity-50 font-mono">Confidence</span>
                            <p className="text-xl font-mono">{currentResult.confidence ? (currentResult.confidence * 100).toFixed(1) + "%" : "N/A"}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-center py-8 border-b border-[#141414]">
                          <div className="text-center">
                            <span className="text-[10px] uppercase opacity-50 font-mono">Total Score</span>
                            <p className="text-7xl font-bold font-serif italic">{currentResult.score}<span className="text-2xl opacity-30 not-italic">/{currentResult.max_score || "-"}</span></p>
                          </div>
                        </div>

                        <div className="flex justify-between text-xs font-mono uppercase opacity-50">
                          <span>Processed at {new Date().toLocaleTimeString()}</span>
                          <span className="flex items-center gap-1 text-green-600"><CheckCircle size={12} /> Verified</span>
                        </div>

                        <button 
                          onClick={() => setActiveTab("detail")}
                          className="w-full border border-[#141414] py-3 uppercase text-[10px] font-mono tracking-widest hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
                        >
                          View Detailed Report
                        </button>
                      </motion.div>
                    ) : (
                      <div className="border border-[#141414] border-dashed p-12 flex items-center justify-center text-center opacity-30">
                        <p className="text-sm uppercase tracking-widest">Waiting for upload...</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "history" && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-6xl mx-auto"
              >
                <div className="flex justify-between items-end mb-12">
                  <h2 className="text-5xl font-serif italic">History</h2>
                  <button 
                    onClick={exportCSV}
                    className="text-xs font-mono uppercase border-b border-[#141414] pb-1 hover:opacity-50"
                  >
                    Export CSV
                  </button>
                </div>

                {/* Statistics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                  <div className="border border-[#141414] p-6 space-y-2">
                    <span className="text-[10px] uppercase opacity-50 font-mono tracking-widest">Avg Score</span>
                    <p className="text-4xl font-serif italic">
                      {results.length > 0 
                        ? (results.reduce((acc, r) => acc + r.score, 0) / results.length).toFixed(1)
                        : "0.0"}
                    </p>
                  </div>
                  <div className="border border-[#141414] p-6 space-y-2">
                    <span className="text-[10px] uppercase opacity-50 font-mono tracking-widest">Candidates</span>
                    <p className="text-4xl font-serif italic">{results.length}</p>
                  </div>
                  <div className="border border-[#141414] p-6 space-y-2">
                    <span className="text-[10px] uppercase opacity-50 font-mono tracking-widest">Pass Rate</span>
                    <p className="text-4xl font-serif italic">
                      {results.length > 0
                        ? ((results.filter(r => r.is_passing).length / results.length) * 100).toFixed(0) + "%"
                        : "0%"}
                    </p>
                  </div>
                </div>

                <div className="border border-[#141414]">
                  <div className="grid grid-cols-5 bg-[#141414] text-[#E4E3E0] p-4 text-[10px] uppercase tracking-widest font-mono">
                    <span>Date</span>
                    <span>Candidate</span>
                    <span>Score</span>
                    <span>Confidence</span>
                    <span className="text-right">Actions</span>
                  </div>
                  <div className="divide-y divide-[#141414]">
                    {results.length === 0 ? (
                      <div className="p-12 text-center opacity-50 uppercase text-xs tracking-widest">No results found for this exam</div>
                    ) : (
                      results.map(res => (
                        <div key={res.id} className="grid grid-cols-5 p-4 items-center hover:bg-[#141414]/5 transition-colors">
                          <span className="text-xs font-mono">{new Date(res.created_at).toLocaleDateString()}</span>
                          <span className="font-bold font-mono">#{res.candidate_number}</span>
                          <span className="text-xl font-serif italic">{res.score}/{res.max_score || "-"}</span>
                          <span className="text-xs font-mono">{res.confidence ? (res.confidence * 100).toFixed(0) + "%" : "N/A"}</span>
                          <div className="flex justify-end gap-4">
                            <button className="hover:opacity-50" onClick={() => {
                              try {
                                setCurrentResult({ ...res, answers: JSON.parse(res.answers) });
                                setActiveTab("detail");
                              } catch (e) {
                                console.error("Failed to parse result answers:", e);
                              }
                            }}><Eye size={16} /></button>
                            <button className="hover:text-red-600" onClick={() => deleteResult(res.id)}><Trash2 size={16} /></button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "settings" && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-5xl mx-auto pb-20"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-12">
                  <div>
                    <h2 className="text-5xl font-serif italic">Exam Settings</h2>
                    <p className="text-sm opacity-50 mt-2 uppercase tracking-widest">Configure session parameters and answer key</p>
                  </div>
                  <div className="flex gap-4 w-full md:w-auto">
                    <input 
                      type="text" 
                      placeholder="New Exam Name"
                      value={newExamName}
                      onChange={(e) => setNewExamName(e.target.value)}
                      className="bg-transparent border border-[#141414] px-4 py-2 text-sm focus:outline-none flex-1"
                    />
                    <button 
                      onClick={createExam}
                      className="bg-[#141414] text-[#E4E3E0] px-6 py-2 text-xs uppercase tracking-widest hover:opacity-90"
                    >
                      Create
                    </button>
                    <button 
                      onClick={() => deleteExam(selectedExamId)}
                      className="border border-red-600 text-red-600 px-4 py-2 text-xs uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all"
                      disabled={!selectedExamId}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Advanced Settings */}
                {exams.find(e => e.id === selectedExamId) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-mono opacity-50">Session Description</label>
                        <textarea 
                          value={exams.find(e => e.id === selectedExamId)?.description || ""}
                          onChange={(e) => updateExamSettings({ description: e.target.value })}
                          className="w-full bg-transparent border border-[#141414] p-4 text-sm focus:outline-none h-24 resize-none"
                          placeholder="Add notes about this session..."
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-mono opacity-50">Questions (10-200)</label>
                          <input 
                            type="number"
                            min="10"
                            max="200"
                            value={exams.find(e => e.id === selectedExamId)?.num_questions || 100}
                            onChange={(e) => updateExamSettings({ num_questions: parseInt(e.target.value) || 100 })}
                            className="w-full bg-transparent border border-[#141414] p-3 text-sm focus:outline-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-mono opacity-50">Pass Threshold (%)</label>
                          <input 
                            type="number"
                            min="0"
                            max="100"
                            value={exams.find(e => e.id === selectedExamId)?.passing_score || 60}
                            onChange={(e) => updateExamSettings({ passing_score: parseInt(e.target.value) || 60 })}
                            className="w-full bg-transparent border border-[#141414] p-3 text-sm focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-mono opacity-50">Wrong Answer Penalty (e.g. -0.25)</label>
                        <input 
                          type="number"
                          step="0.05"
                          value={exams.find(e => e.id === selectedExamId)?.penalty || 0}
                          onChange={(e) => updateExamSettings({ penalty: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-transparent border border-[#141414] p-3 text-sm focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-8 border-l border-[#141414] pl-0 md:pl-12">
                      <h3 className="text-2xl font-serif italic">Data Management</h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Answer Key CSV Tools</span>
                          <div className="flex gap-2">
                            <label className="cursor-pointer bg-[#141414] text-[#E4E3E0] px-4 py-2 text-[10px] uppercase tracking-widest hover:opacity-80">
                              Import
                              <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
                            </label>
                            <button 
                              onClick={exportAnswerKeyCSV}
                              className="border border-[#141414] px-4 py-2 text-[10px] uppercase tracking-widest hover:bg-[#141414] hover:text-[#E4E3E0]"
                            >
                              Export
                            </button>
                          </div>
                        </div>
                        <div className="pt-8 border-t border-[#141414]">
                          <button 
                            onClick={clearAllData}
                            className="w-full border border-red-600 text-red-600 py-4 text-[10px] uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all"
                          >
                            Clear All Local Storage Data
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="border-t border-[#141414] pt-12">
                  <h3 className="text-2xl font-serif italic mb-8">Manual Answer Key</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-4">
                    {Object.keys(answerKey).sort((a, b) => parseInt(a) - parseInt(b)).map(q => (
                      <div key={q} className="border border-[#141414] p-3 space-y-2 group hover:bg-[#141414] hover:text-[#E4E3E0] transition-all">
                        <span className="text-[10px] font-mono opacity-50 block">{q}</span>
                        <select 
                          value={answerKey[q]}
                          onChange={(e) => updateAnswerKey(q, e.target.value)}
                          className="bg-transparent w-full text-lg font-bold font-mono focus:outline-none appearance-none cursor-pointer"
                        >
                          {["A", "B", "C", "D", "E"].map(opt => (
                            <option key={opt} value={opt} className="text-[#141414]">{opt}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "detail" && currentResult && (
              <motion.div 
                key="detail"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="max-w-6xl mx-auto pb-20"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-12">
                  <div>
                    <div className="flex items-center gap-4">
                      <h2 className="text-5xl font-serif italic">Result Detail</h2>
                      <span className={cn(
                        "px-3 py-1 text-[10px] font-mono uppercase tracking-widest border",
                        currentResult.is_passing ? "border-green-600 text-green-600" : "border-red-600 text-red-600"
                      )}>
                        {currentResult.is_passing ? "Pass" : "Fail"}
                      </span>
                    </div>
                    <p className="text-sm opacity-50 mt-2 uppercase tracking-widest">
                      Candidate #{currentResult.candidate_number} • 
                      Score: <span className="text-[#141414] font-bold">{currentResult.score}/{currentResult.max_score || "-"}</span> • 
                      Confidence: {currentResult.confidence ? (currentResult.confidence * 100).toFixed(1) + "%" : "N/A"}
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setActiveTab("correct")}
                      className="text-xs font-mono uppercase border border-[#141414] px-4 py-2 hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
                    >
                      New Upload
                    </button>
                    <button 
                      onClick={() => setActiveTab("history")}
                      className="text-xs font-mono uppercase bg-[#141414] text-[#E4E3E0] px-4 py-2 hover:opacity-80 transition-all"
                    >
                      Back to History
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-12">
                  <div className="border border-green-600/30 bg-green-600/5 p-6 flex flex-col items-center justify-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-green-700 opacity-70">Correct</span>
                    <span className="text-4xl font-serif italic text-green-700">{correctCount}</span>
                  </div>
                  <div className="border border-red-600/30 bg-red-600/5 p-6 flex flex-col items-center justify-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-red-700 opacity-70">Incorrect</span>
                    <span className="text-4xl font-serif italic text-red-700">{incorrectCount}</span>
                  </div>
                  <div className="border border-amber-600/30 bg-amber-600/5 p-6 flex flex-col items-center justify-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-amber-700 opacity-70">Unanswered</span>
                    <span className="text-4xl font-serif italic text-amber-700">{unansweredCount}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {Object.keys(answerKey).sort((a, b) => parseInt(a) - parseInt(b)).map(q => {
                    const studentAns = currentResult.answers[q];
                    const correctAns = answerKey[q];
                    const isCorrect = studentAns === correctAns;

                    return (
                      <div key={q} className={cn(
                        "border p-4 flex flex-col gap-2 transition-all",
                        isCorrect ? "border-green-600/30 bg-green-600/5" : 
                        !studentAns ? "border-amber-600/30 bg-amber-600/5" : "border-red-600/30 bg-red-600/5"
                      )}>
                        <div className="flex justify-between items-center border-b border-[#141414]/10 pb-2">
                          <span className="text-xs font-mono font-bold uppercase">Question {q}</span>
                          {isCorrect ? (
                            <CheckCircle size={14} className="text-green-600" />
                          ) : !studentAns ? (
                            <AlertCircle size={14} className="text-amber-600" />
                          ) : (
                            <XCircle size={14} className="text-red-600" />
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-center pt-1">
                          <div>
                            <span className="text-[9px] uppercase font-mono opacity-50 block mb-1">Student</span>
                            <span className={cn(
                              "text-lg font-bold font-mono",
                              isCorrect ? "text-green-700" : !studentAns ? "text-amber-700" : "text-red-700"
                            )}>
                              {studentAns || "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] uppercase font-mono opacity-50 block mb-1">Correct</span>
                            <span className="text-lg font-bold font-mono text-[#141414]">
                              {correctAns}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* CSV Preview Modal */}
      {csvPreview && (
        <div className="fixed inset-0 bg-[#141414]/90 z-50 flex items-center justify-center p-6">
          <div className="bg-[#E4E3E0] w-full max-w-2xl border border-[#141414] p-8 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-serif italic">Import Preview</h3>
              <button onClick={() => setCsvPreview(null)} className="hover:opacity-50"><Trash2 size={24} /></button>
            </div>
            <p className="text-sm opacity-70">Detected {Object.keys(csvPreview).length} questions. Confirm to overwrite current answer key.</p>
            <div className="max-h-64 overflow-y-auto border border-[#141414] p-4">
              <div className="grid grid-cols-5 gap-2">
                {Object.keys(csvPreview).sort((a, b) => parseInt(a) - parseInt(b)).map(q => (
                  <div key={q} className="text-[10px] font-mono border border-[#141414]/20 p-1 flex justify-between">
                    <span className="opacity-50">{q}:</span>
                    <span className="font-bold">{csvPreview[q]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setCsvPreview(null)}
                className="flex-1 border border-[#141414] py-3 uppercase text-[10px] font-mono tracking-widest hover:bg-[#141414] hover:text-[#E4E3E0]"
              >
                Cancel
              </button>
              <button 
                onClick={confirmImport}
                className="flex-1 bg-[#141414] text-[#E4E3E0] py-3 uppercase text-[10px] font-mono tracking-widest hover:opacity-80"
              >
                Confirm Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Modal (Simplified) */}
      {showCamera && (
        <div className="fixed inset-0 bg-[#141414]/90 z-50 flex items-center justify-center p-6">
          <div className="bg-[#E4E3E0] w-full max-w-2xl border border-[#141414] p-8 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-serif italic">Capture Sheet</h3>
              <button onClick={() => setShowCamera(false)} className="hover:opacity-50"><Trash2 size={24} /></button>
            </div>
            <div className="aspect-[3/4] bg-black border border-[#141414] flex items-center justify-center">
              <Camera size={48} className="text-white/20" />
            </div>
            <button className="w-full bg-[#141414] text-[#E4E3E0] py-4 uppercase tracking-widest text-sm">Capture & Analyze</button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-[#141414] p-4 flex justify-between items-center text-[10px] uppercase tracking-[0.2em] font-mono">
        <div className="flex items-center gap-4">
          <span className="opacity-30">System Status: Operational</span>
          <div className="flex items-center gap-2">
            <span className="opacity-30">Gemini API:</span>
            <div className={cn("w-2 h-2 rounded-full", apiKeySet ? "bg-green-500" : "bg-red-500")} />
            {!apiKeySet && (
              <a 
                href="https://ai.google.dev/" 
                target="_blank" 
                rel="noreferrer"
                className="opacity-50 hover:opacity-100 underline decoration-dotted"
              >
                Configure Key
              </a>
            )}
          </div>
        </div>
        <span className="opacity-30">© 2026 ExamChecker AI</span>
      </footer>
    </div>
  );
}
