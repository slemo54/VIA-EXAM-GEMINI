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
  XCircle,
  Users,
  Moon,
  Sun
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { pdfToImages } from "./lib/pdf";
import { analyzeExamSheet } from "./lib/gemini";
import * as db from "./lib/supabase";
import { Database, CloudOff } from "lucide-react";
import { set as idbSet, get as idbGet, del as idbDel } from 'idb-keyval';

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
  candidate_id?: string;
  answers: string; // JSON string
  score: number;
  max_score: number;
  is_passing: boolean;
  confidence: number;
  created_at: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"correct" | "history" | "settings" | "detail" | "candidates">("correct");
  const [exams, setExams] = useState<Exam[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [currentResult, setCurrentResult] = useState<any>(null);
  const [answerKey, setAnswerKey] = useState<Record<string, string>>({});
  const [newExamName, setNewExamName] = useState("");
  const [csvPreview, setCsvPreview] = useState<Record<string, string> | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [dbStatus, setDbStatus] = useState<"supabase" | "local">("local");
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void } | null>(null);
  const [promptDialog, setPromptDialog] = useState<{
    title: string;
    message: string;
    options: { label: string; onClick: () => void; className?: string }[];
  } | null>(null);
  const [viewImages, setViewImages] = useState<string[] | null>(null);
  const [filterCandidate, setFilterCandidate] = useState("");
  const [filterScoreMin, setFilterScoreMin] = useState("");
  const [filterScoreMax, setFilterScoreMax] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pass" | "fail">("all");
  const [filterConfidenceMin, setFilterConfidenceMin] = useState("");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "score_desc" | "score_asc" | "confidence_desc" | "confidence_asc">("date_desc");
  const [breakdownQuestion, setBreakdownQuestion] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access the camera. Please ensure permissions are granted.");
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (showCamera && !capturedImage) {
      startCamera();
    } else {
      stopCamera();
      if (!showCamera) {
        setCapturedImage(null);
      }
    }
    return () => stopCamera();
  }, [showCamera, capturedImage]);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedImage(dataUrl);
      }
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
  };

  const analyzeCapturedPhoto = async () => {
    if (!capturedImage) return;
    
    // Convert data URL to File object
    const res = await fetch(capturedImage);
    const blob = await res.blob();
    const file = new File([blob], "captured-exam.jpg", { type: "image/jpeg" });
    
    setShowCamera(false);
    setCapturedImage(null);
    await processFiles([file]);
  };

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
      fetchCandidates();
    };
    initialize();
  }, []);

  const fetchCandidates = async () => {
    try {
      const data = await db.getCandidates();
      setCandidates(data);
    } catch (err) {
      console.error("Failed to fetch candidates", err);
    }
  };

  const deleteExam = async (id: string) => {
    setConfirmDialog({
      message: "Are you sure you want to delete this exam and all its results?",
      onConfirm: async () => {
        try {
          await db.deleteExamData(id);
          fetchExams();
          if (selectedExamId === id) {
            setSelectedExamId("");
          }
        } catch (err) {
          console.error("Failed to delete exam", err);
        }
        setConfirmDialog(null);
      }
    });
  };

  const deleteResult = async (id: string) => {
    setConfirmDialog({
      message: "Are you sure you want to delete this result?",
      onConfirm: async () => {
        try {
          await db.deleteResultData(id);
          fetchResults(selectedExamId);
          await idbDel(`images_${id}`);
        } catch (err) {
          console.error("Failed to delete result", err);
        }
        setConfirmDialog(null);
      }
    });
  };

  const exportCSV = () => {
    if (results.length === 0) return;
    
    const headers = ["Date", "Candidate Number", "Candidate ID", "Score", "Max Score", "Status", "Confidence"];
    const rows = results.map(r => [
      new Date(r.created_at).toLocaleDateString(),
      r.candidate_number,
      r.candidate_id && r.candidate_id !== "Unknown" ? r.candidate_id : "N/A",
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

  const showPrompt = (title: string, message: string, options: { label: string; value: string; className?: string }[]) => {
    return new Promise<string>((resolve) => {
      setPromptDialog({
        title,
        message,
        options: options.map(opt => ({
          label: opt.label,
          className: opt.className,
          onClick: () => {
            setPromptDialog(null);
            resolve(opt.value);
          }
        }))
      });
    });
  };

  const processFiles = async (files: FileList | File[]) => {
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

        let currentCandidateAnswers: Record<string, any> = { _unsure: [] };
        let currentCandidateNumber = "Unknown";
        let currentCandidateId = "Unknown";
        let currentTotalConfidence = 0;
        let currentPagesAnalyzed = 0;
        let currentImages: string[] = [];
        let lastResultData: any = null;

        const saveCurrentResult = async () => {
          if (currentPagesAnalyzed === 0) return;
          
          let score = 0;
          let totalCorrect = 0;
          let totalWrong = 0;
          
          Object.keys(answerKey).forEach(q => {
            const studentAns = currentCandidateAnswers[q];
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
            candidate_number: currentCandidateNumber,
            candidate_id: currentCandidateId !== "Unknown" ? currentCandidateId : undefined,
            answers: JSON.stringify(currentCandidateAnswers),
            score: parseFloat(score.toFixed(2)),
            max_score: maxScore,
            is_passing: isPassing,
            confidence: currentTotalConfidence / currentPagesAnalyzed,
            created_at: new Date().toISOString(),
            total_correct: totalCorrect,
            total_wrong: totalWrong
          };

          await db.saveResult(resultData);
          
          try {
            await idbSet(`images_${resultId}`, JSON.stringify(currentImages));
          } catch (e) {
            console.error("Failed to save images to IndexedDB:", e);
          }

          lastResultData = { ...resultData, answers: currentCandidateAnswers };
        };

        const checkConfidenceAndPrompt = async (resultData: any) => {
          if (resultData && resultData.confidence < 0.95) {
            const action = await showPrompt(
              "Low Confidence Detected",
              `Confidence for Candidate #${resultData.candidate_number} is low (${(resultData.confidence * 100).toFixed(1)}%). What would you like to do?`,
              [
                { label: "Manual Review", value: "review", className: "bg-ink text-base" },
                { label: "Discard & Rescan", value: "rescan", className: "border-red-600 text-red-600 hover:bg-red-600 hover:text-white" },
                { label: "Ignore & Continue", value: "continue" }
              ]
            );

            if (action === "rescan") {
              await db.deleteResultData(resultData.id);
              await idbDel(`images_${resultData.id}`);
              return "rescan";
            } else if (action === "review") {
              setCurrentResult(resultData);
              setActiveTab("detail");
              return "review";
            }
          }
          return "continue";
        };

        for (let j = 0; j < images.length; j++) {
          const imageBase64 = images[j];
          let retryCount = 0;
          let analysisSuccess = false;
          let analysis: any = null;

          while (retryCount < 2 && !analysisSuccess) {
            setUploadProgress(`Preparing page ${j + 1} of ${images.length} for AI analysis...${retryCount > 0 ? ` (Retry ${retryCount})` : ''}`);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            setUploadProgress(`AI is scanning page ${j + 1} of ${images.length} (this may take a few seconds)...`);
            try {
              analysis = await analyzeExamSheet(
                imageBase64, 
                currentExam.num_questions,
                (msg) => {
                  setUploadProgress(`Page ${j + 1}/${images.length}: ${msg}`);
                }
              );
              
              setUploadProgress(`Processing answers from page ${j + 1}...`);
              await new Promise(resolve => setTimeout(resolve, 500));
              
              if (!analysis || typeof analysis !== "object" || !analysis.detected_answers) {
                console.error("Invalid AI analysis result:", analysis);
                throw new Error("Invalid format");
              }

              if (analysis.confidence <= 0.95 && retryCount < 1) {
                setUploadProgress(`Confidence is low (${(analysis.confidence * 100).toFixed(1)}%). Retrying automatically...`);
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, 1500));
                continue;
              }

              analysisSuccess = true;
            } catch (pageError) {
              console.error(`Error analyzing page ${j + 1}:`, pageError);
              if (retryCount < 1) {
                setUploadProgress(`Warning: Failed to analyze page ${j + 1}. Retrying...`);
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, 2000));
              } else {
                setUploadProgress(`Warning: Failed to analyze page ${j + 1} after retries. Continuing...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                break;
              }
            }
          }

          if (!analysisSuccess) {
            currentPagesAnalyzed++;
            currentImages.push(imageBase64);
            continue;
          }

          const detectedCandidateNumber = analysis.candidate_number && analysis.candidate_number !== "null" 
            ? String(analysis.candidate_number).trim().substring(0, 20) 
            : null;

          const detectedCandidateId = analysis.candidate_id && analysis.candidate_id !== "null"
            ? String(analysis.candidate_id).trim().substring(0, 20)
            : null;

          if ((detectedCandidateNumber || detectedCandidateId) && currentPagesAnalyzed > 0) {
            setUploadProgress(`New candidate detected. Saving previous exam...`);
            await saveCurrentResult();
            
            if (lastResultData) {
              const action = await checkConfidenceAndPrompt(lastResultData);
              if (action === "review") {
                // We don't break the loop, but we might want to let the user review later.
                // Actually, if they choose review, we set the tab to detail. The loop will continue.
                // If they choose rescan, it's deleted.
              }
            }
            
            currentCandidateAnswers = { _unsure: [] };
            currentCandidateNumber = detectedCandidateNumber || "Unknown";
            currentCandidateId = detectedCandidateId || "Unknown";
            currentTotalConfidence = 0;
            currentPagesAnalyzed = 0;
            currentImages = [];
          } else {
            if (detectedCandidateNumber && currentCandidateNumber === "Unknown") {
              currentCandidateNumber = detectedCandidateNumber;
            }
            if (detectedCandidateId && currentCandidateId === "Unknown") {
              currentCandidateId = detectedCandidateId;
            }
          }

          const numAnswersFound = Array.isArray(analysis.detected_answers) ? analysis.detected_answers.length : 0;
          console.log(`AI found ${numAnswersFound} answers on page ${j + 1}`);
          setUploadProgress(`Found ${numAnswersFound} answers on page ${j + 1}. Merging data...`);
          await new Promise(resolve => setTimeout(resolve, 500));

          const cleanedAnswers: Record<string, any> = {};
          const unsureList: string[] = [];
          
          if (Array.isArray(analysis.detected_answers)) {
            analysis.detected_answers.forEach((item: any) => {
              if (item.question_number && item.selected_option && typeof item.selected_option === "string") {
                const qNum = item.question_number.toString();
                cleanedAnswers[qNum] = item.selected_option.trim().charAt(0).toUpperCase();
                if (item.is_unsure) {
                  unsureList.push(qNum);
                }
              }
            });
          }

          currentCandidateAnswers = { 
            ...currentCandidateAnswers, 
            ...cleanedAnswers,
            _unsure: [...(currentCandidateAnswers._unsure || []), ...unsureList]
          };
          
          currentTotalConfidence += (Number(analysis.confidence) || 0.5);
          currentPagesAnalyzed++;
          currentImages.push(imageBase64);
        }

        await saveCurrentResult();

        if (lastResultData) {
          const action = await checkConfidenceAndPrompt(lastResultData);
          if (action !== "rescan") {
            setCurrentResult(lastResultData);
          } else {
            setCurrentResult(null);
          }
        }
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files);
    }
    e.target.value = '';
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

  const handleCandidateCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        
        if (lines.length < 2) {
          alert("CSV must contain a header row and at least one data row.");
          return;
        }

        const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
        const nameIdx = headers.indexOf('name');
        const surnameIdx = headers.indexOf('surname');
        const idIdx = headers.indexOf('candidate_id');

        if (nameIdx === -1 || surnameIdx === -1 || idIdx === -1) {
          alert("CSV must contain columns: name, surname, candidate_id");
          return;
        }

        const newCandidates = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          if (cols.length >= 3) {
            newCandidates.push({
              name: cols[nameIdx] || "",
              surname: cols[surnameIdx] || "",
              candidate_id: cols[idIdx] || ""
            });
          }
        }

        await db.saveCandidates(newCandidates);
        fetchCandidates();
        alert(`Successfully imported ${newCandidates.length} candidates.`);
      } catch (err) {
        console.error("Failed to parse candidates CSV", err);
        alert("Failed to parse CSV file.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
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
    setConfirmDialog({
      message: "WARNING: This will delete ALL exams and results. This action cannot be undone. Proceed?",
      onConfirm: async () => {
        await db.clearAll();
        window.location.reload();
      }
    });
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
  const unsureCount = currentResult?.answers?._unsure?.length || 0;

  const filteredResults = results.filter(r => {
    if (filterCandidate) {
      const search = filterCandidate.toLowerCase();
      const matchNumber = r.candidate_number.toLowerCase().includes(search);
      const matchId = r.candidate_id ? r.candidate_id.toLowerCase().includes(search) : false;
      if (!matchNumber && !matchId) return false;
    }
    if (filterScoreMin && r.score < parseFloat(filterScoreMin)) return false;
    if (filterScoreMax && r.score > parseFloat(filterScoreMax)) return false;
    if (filterStatus === "pass" && !r.is_passing) return false;
    if (filterStatus === "fail" && r.is_passing) return false;
    if (filterConfidenceMin && r.confidence < parseFloat(filterConfidenceMin) / 100) return false;
    return true;
  }).sort((a, b) => {
    switch (sortBy) {
      case "date_asc": return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case "score_desc": return b.score - a.score;
      case "score_asc": return a.score - b.score;
      case "confidence_desc": return (b.confidence || 0) - (a.confidence || 0);
      case "confidence_asc": return (a.confidence || 0) - (b.confidence || 0);
      case "date_desc":
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  const exportSingleResult = () => {
    if (!currentResult) return;
    
    const headers = ["Question", "Student Answer", "Correct Answer", "Status"];
    const rows = Object.keys(answerKey).sort((a, b) => parseInt(a) - parseInt(b)).map(q => {
      const studentAns = currentResult.answers[q] || "—";
      const correctAns = answerKey[q];
      const status = studentAns === correctAns ? "Correct" : (!currentResult.answers[q] ? "Unanswered" : "Incorrect");
      return [q, studentAns, correctAns, status];
    });
    
    const csvContent = [
      `Candidate Number,${currentResult.candidate_number}`,
      `Candidate ID,${currentResult.candidate_id && currentResult.candidate_id !== "Unknown" ? currentResult.candidate_id : "N/A"}`,
      `Score,${currentResult.score}/${currentResult.max_score}`,
      `Status,${currentResult.is_passing ? "PASS" : "FAIL"}`,
      `Date,${new Date(currentResult.created_at).toLocaleDateString()}`,
      "",
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `result_${currentResult.candidate_number}_${selectedExamId}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getQuestionBreakdown = (q: string) => {
    const breakdown: Record<string, number> = {};
    let total = 0;
    results.forEach(r => {
      try {
        const ans = typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers;
        const studentAns = ans[q] || "Unanswered";
        breakdown[studentAns] = (breakdown[studentAns] || 0) + 1;
        total++;
      } catch (e) {}
    });
    return { breakdown, total };
  };

  return (
    <div className="min-h-screen bg-base text-ink font-sans selection:bg-ink selection:text-base">
      {/* Header */}
      <header className="border-b border-ink p-4 lg:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tighter uppercase italic font-serif">ExamChecker AI</h1>
          <p className="text-[10px] lg:text-xs opacity-50 uppercase tracking-widest mt-1">Vision-Powered OMR Engine</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:gap-4 w-full md:w-auto">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1 border text-[10px] font-mono uppercase tracking-widest flex-1 md:flex-none justify-center",
            dbStatus === "supabase" ? "border-green-600/50 text-green-600" : "border-amber-600/50 text-amber-600"
          )}>
            {dbStatus === "supabase" ? <Database size={12} /> : <CloudOff size={12} />}
            <span className="hidden sm:inline">{dbStatus === "supabase" ? "Supabase Connected" : "Local Only"}</span>
            <span className="sm:inline hidden">{dbStatus === "supabase" ? "" : ""}</span>
            <span className="sm:hidden">{dbStatus === "supabase" ? "Supabase" : "Local"}</span>
          </div>
          <select 
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="bg-transparent border border-ink px-3 py-1 text-xs lg:text-sm focus:outline-none flex-1 md:flex-none"
          >
            {exams.map(exam => (
              <option key={exam.id} value={exam.id}>{exam.name}</option>
            ))}
          </select>
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 border border-ink hover:bg-ink hover:text-base transition-colors flex-none"
            title="Toggle Dark Mode"
          >
            {darkMode ? <Sun size={16} className="lg:w-[18px] lg:h-[18px]" /> : <Moon size={16} className="lg:w-[18px] lg:h-[18px]" />}
          </button>
          <button 
            onClick={() => setActiveTab("settings")}
            className="p-2 border border-ink hover:bg-ink hover:text-base transition-colors flex-none"
          >
            <Settings size={16} className="lg:w-[18px] lg:h-[18px]" />
          </button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-100px)]">
        {/* Sidebar Navigation */}
        <nav className="w-full lg:w-20 border-b lg:border-b-0 lg:border-r border-ink flex lg:flex-col items-center justify-center py-2 lg:py-8 gap-2 sm:gap-4 lg:gap-8 px-2 sm:px-4 lg:px-0 overflow-x-auto">
          <button 
            onClick={() => setActiveTab("correct")}
            className={cn("p-2 sm:p-3 transition-all flex items-center gap-2 lg:block", activeTab === "correct" ? "bg-ink text-base" : "hover:opacity-50")}
            title="Correction"
          >
            <Upload size={20} className="lg:w-6 lg:h-6" />
            <span className="lg:hidden text-[10px] sm:text-xs font-mono uppercase">Correct</span>
          </button>
          <button 
            onClick={() => setActiveTab("history")}
            className={cn("p-2 sm:p-3 transition-all flex items-center gap-2 lg:block", activeTab === "history" ? "bg-ink text-base" : "hover:opacity-50")}
            title="History"
          >
            <History size={20} className="lg:w-6 lg:h-6" />
            <span className="lg:hidden text-[10px] sm:text-xs font-mono uppercase">History</span>
          </button>
          <button 
            onClick={() => setActiveTab("settings")}
            className={cn("p-2 sm:p-3 transition-all flex items-center gap-2 lg:block", activeTab === "settings" ? "bg-ink text-base" : "hover:opacity-50")}
            title="Answer Key"
          >
            <FileText size={20} className="lg:w-6 lg:h-6" />
            <span className="lg:hidden text-[10px] sm:text-xs font-mono uppercase">Key</span>
          </button>
          <button 
            onClick={() => setActiveTab("candidates")}
            className={cn("p-2 sm:p-3 transition-all flex items-center gap-2 lg:block", activeTab === "candidates" ? "bg-ink text-base" : "hover:opacity-50")}
            title="Candidates"
          >
            <Users size={20} className="lg:w-6 lg:h-6" />
            <span className="lg:hidden text-[10px] sm:text-xs font-mono uppercase">Users</span>
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
                    <h2 className="text-3xl sm:text-4xl font-serif italic">Upload Sheets</h2>
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
                        "border-2 border-dashed border-ink p-8 sm:p-12 flex flex-col items-center justify-center gap-4 transition-all",
                        isUploading ? "opacity-50" : "group-hover:bg-ink/5"
                      )}>
                        {isUploading ? (
                          <Loader2 className="animate-spin" size={48} />
                        ) : (
                          <Upload size={48} />
                        )}
                        <span className="text-sm font-mono uppercase tracking-widest text-center">
                          {isUploading ? uploadProgress : "Drag & Drop or Click"}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <button 
                        className="flex-1 border border-ink py-3 uppercase text-xs font-mono tracking-widest hover:bg-ink hover:text-base transition-all flex items-center justify-center gap-2"
                        onClick={() => setShowCamera(true)}
                      >
                        <Camera size={16} /> Use Camera
                      </button>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <h2 className="text-3xl sm:text-4xl font-serif italic">Live Result</h2>
                    {currentResult ? (
                      <motion.div 
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="border border-ink p-4 sm:p-8 space-y-6 bg-card shadow-[4px_4px_0px_0px_var(--shadow)] sm:shadow-[8px_8px_0px_0px_var(--shadow)]"
                      >
                        <div className="flex justify-between items-start border-b border-ink pb-4">
                          <div>
                            <span className="text-[10px] uppercase opacity-50 font-mono">Candidate</span>
                            <p className="text-2xl font-mono font-bold">
                              #{currentResult.candidate_number}
                              {currentResult.candidate_id && currentResult.candidate_id !== "Unknown" && (
                                <span className="ml-2 text-lg text-gray-500">({currentResult.candidate_id})</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] uppercase opacity-50 font-mono">Confidence</span>
                            <p className="text-xl font-mono">{currentResult.confidence ? (currentResult.confidence * 100).toFixed(1) + "%" : "N/A"}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-center py-8 border-b border-ink">
                          <div className="text-center">
                            <span className="text-[10px] uppercase opacity-50 font-mono">Total Score</span>
                            <p className="text-5xl sm:text-7xl font-bold font-serif italic">{currentResult.score}<span className="text-xl sm:text-2xl opacity-30 not-italic">/{currentResult.max_score || "-"}</span></p>
                          </div>
                        </div>

                        <div className="flex justify-between text-xs font-mono uppercase opacity-50">
                          <span>Processed at {new Date().toLocaleTimeString()}</span>
                          <span className="flex items-center gap-1 text-green-600"><CheckCircle size={12} /> Verified</span>
                        </div>

                        <button 
                          onClick={() => setActiveTab("detail")}
                          className="w-full border border-ink py-3 uppercase text-[10px] font-mono tracking-widest hover:bg-ink hover:text-base transition-all"
                        >
                          View Detailed Report
                        </button>
                      </motion.div>
                    ) : (
                      <div className="border border-ink border-dashed p-12 flex items-center justify-center text-center opacity-30">
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
                  <h2 className="text-4xl sm:text-5xl font-serif italic">History</h2>
                  <button 
                    onClick={exportCSV}
                    className="text-xs font-mono uppercase border-b border-ink pb-1 hover:opacity-50"
                  >
                    Export CSV
                  </button>
                </div>

                {/* Statistics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8 mb-12">
                  <div className="border border-ink p-4 sm:p-6 space-y-2">
                    <span className="text-[10px] uppercase opacity-50 font-mono tracking-widest">Avg Score</span>
                    <p className="text-3xl sm:text-4xl font-serif italic">
                      {results.length > 0 
                        ? (results.reduce((acc, r) => acc + r.score, 0) / results.length).toFixed(1)
                        : "0.0"}
                    </p>
                  </div>
                  <div className="border border-ink p-4 sm:p-6 space-y-2">
                    <span className="text-[10px] uppercase opacity-50 font-mono tracking-widest">Candidates</span>
                    <p className="text-3xl sm:text-4xl font-serif italic">{results.length}</p>
                  </div>
                  <div className="border border-ink p-4 sm:p-6 space-y-2">
                    <span className="text-[10px] uppercase opacity-50 font-mono tracking-widest">Pass Rate</span>
                    <p className="text-3xl sm:text-4xl font-serif italic">
                      {results.length > 0
                        ? ((results.filter(r => r.is_passing).length / results.length) * 100).toFixed(0) + "%"
                        : "0%"}
                    </p>
                  </div>
                </div>

                <div className="border border-ink mb-8 p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono opacity-50">Candidate #</label>
                    <input 
                      type="text" 
                      value={filterCandidate}
                      onChange={e => setFilterCandidate(e.target.value)}
                      placeholder="Search..."
                      className="bg-transparent border-b border-ink px-2 py-1 text-sm focus:outline-none w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono opacity-50">Min Score</label>
                    <input 
                      type="number" 
                      value={filterScoreMin}
                      onChange={e => setFilterScoreMin(e.target.value)}
                      placeholder="0"
                      className="bg-transparent border-b border-ink px-2 py-1 text-sm focus:outline-none w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono opacity-50">Max Score</label>
                    <input 
                      type="number" 
                      value={filterScoreMax}
                      onChange={e => setFilterScoreMax(e.target.value)}
                      placeholder="100"
                      className="bg-transparent border-b border-ink px-2 py-1 text-sm focus:outline-none w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono opacity-50">Status</label>
                    <select 
                      value={filterStatus}
                      onChange={e => setFilterStatus(e.target.value as any)}
                      className="bg-transparent border-b border-ink px-2 py-1 text-sm focus:outline-none w-full"
                    >
                      <option value="all">All</option>
                      <option value="pass">Pass</option>
                      <option value="fail">Fail</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono opacity-50">Min Conf (%)</label>
                    <input 
                      type="number" 
                      value={filterConfidenceMin}
                      onChange={e => setFilterConfidenceMin(e.target.value)}
                      placeholder="0"
                      className="bg-transparent border-b border-ink px-2 py-1 text-sm focus:outline-none w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono opacity-50">Sort By</label>
                    <select 
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as any)}
                      className="bg-transparent border-b border-ink px-2 py-1 text-sm focus:outline-none w-full"
                    >
                      <option value="date_desc">Newest First</option>
                      <option value="date_asc">Oldest First</option>
                      <option value="score_desc">Highest Score</option>
                      <option value="score_asc">Lowest Score</option>
                      <option value="confidence_desc">Highest Conf</option>
                      <option value="confidence_asc">Lowest Conf</option>
                    </select>
                  </div>
                </div>

                <div className="border border-ink">
                  <div className="hidden md:grid grid-cols-5 bg-ink text-base p-4 text-[10px] uppercase tracking-widest font-mono">
                    <span>Date</span>
                    <span>Candidate</span>
                    <span>Score</span>
                    <span>Confidence</span>
                    <span className="text-right">Actions</span>
                  </div>
                  <div className="divide-y divide-ink">
                    {filteredResults.length === 0 ? (
                      <div className="p-12 text-center opacity-50 uppercase text-xs tracking-widest">No results found matching filters</div>
                    ) : (
                      filteredResults.map(res => (
                        <div key={res.id} className="grid grid-cols-1 md:grid-cols-5 p-4 items-center gap-4 md:gap-0 hover:bg-ink/5 transition-colors">
                          <div className="flex justify-between md:block">
                            <span className="md:hidden text-[10px] uppercase opacity-50 font-mono">Date</span>
                            <span className="text-xs font-mono">{new Date(res.created_at).toLocaleDateString()}</span>
                          </div>
                          <div className="flex justify-between md:block items-center">
                            <span className="md:hidden text-[10px] uppercase opacity-50 font-mono">Candidate</span>
                            <span className="font-bold font-mono">
                              #{res.candidate_number}
                              {(() => {
                                const matchedCandidate = candidates.find(c => c.candidate_id === res.candidate_number || c.candidate_id === res.candidate_id);
                                if (matchedCandidate) {
                                  return <span className="ml-2 text-xs font-serif font-normal opacity-70">{matchedCandidate.name} {matchedCandidate.surname}</span>;
                                }
                                if (res.candidate_id && res.candidate_id !== "Unknown") {
                                  return <span className="ml-2 text-xs text-gray-500 font-normal">({res.candidate_id})</span>;
                                }
                                return null;
                              })()}
                            </span>
                          </div>
                          <div className="flex justify-between md:block items-center">
                            <span className="md:hidden text-[10px] uppercase opacity-50 font-mono">Score</span>
                            <span className="text-xl font-serif italic">{res.score}/{res.max_score || "-"}</span>
                          </div>
                          <div className="flex justify-between md:block items-center">
                            <span className="md:hidden text-[10px] uppercase opacity-50 font-mono">Confidence</span>
                            <span className="text-xs font-mono">{res.confidence ? (res.confidence * 100).toFixed(0) + "%" : "N/A"}</span>
                          </div>
                          <div className="flex justify-end gap-4 mt-2 md:mt-0 pt-2 md:pt-0 border-t border-ink/10 md:border-0">
                            <button className="hover:opacity-50 flex items-center gap-2 text-xs uppercase font-mono" onClick={() => {
                              try {
                                setCurrentResult({ ...res, answers: JSON.parse(res.answers) });
                                setActiveTab("detail");
                              } catch (e) {
                                console.error("Failed to parse result answers:", e);
                              }
                            }}><Eye size={16} /> <span className="md:hidden">View</span></button>
                            <button className="hover:text-red-600 flex items-center gap-2 text-xs uppercase font-mono" onClick={() => deleteResult(res.id)}><Trash2 size={16} /> <span className="md:hidden">Delete</span></button>
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
                    <h2 className="text-4xl sm:text-5xl font-serif italic">Exam Settings</h2>
                    <p className="text-sm opacity-50 mt-2 uppercase tracking-widest">Configure session parameters and answer key</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full md:w-auto">
                    <input 
                      type="text" 
                      placeholder="New Exam Name"
                      value={newExamName}
                      onChange={(e) => setNewExamName(e.target.value)}
                      className="bg-transparent border border-ink px-4 py-2 text-sm focus:outline-none flex-1"
                    />
                    <div className="flex gap-2">
                      <button 
                        onClick={createExam}
                        className="flex-1 bg-ink text-base px-6 py-2 text-xs uppercase tracking-widest hover:opacity-90"
                      >
                        Create
                      </button>
                      <button 
                        onClick={() => deleteExam(selectedExamId)}
                        className="flex-1 border border-red-600 text-red-600 px-4 py-2 text-xs uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all"
                        disabled={!selectedExamId}
                      >
                        Delete
                      </button>
                    </div>
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
                          className="w-full bg-transparent border border-ink p-4 text-sm focus:outline-none h-24 resize-none"
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
                            className="w-full bg-transparent border border-ink p-3 text-sm focus:outline-none"
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
                            className="w-full bg-transparent border border-ink p-3 text-sm focus:outline-none"
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
                          className="w-full bg-transparent border border-ink p-3 text-sm focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-8 pt-8 md:pt-0 border-t md:border-t-0 md:border-l border-ink pl-0 md:pl-12">
                      <h3 className="text-2xl font-serif italic">Data Management</h3>
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <span className="text-sm">Answer Key CSV Tools</span>
                          <div className="flex gap-2 w-full sm:w-auto">
                            <label className="flex-1 sm:flex-none text-center cursor-pointer bg-ink text-base px-4 py-2 text-[10px] uppercase tracking-widest hover:opacity-80">
                              Import
                              <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
                            </label>
                            <button 
                              onClick={exportAnswerKeyCSV}
                              className="flex-1 sm:flex-none border border-ink px-4 py-2 text-[10px] uppercase tracking-widest hover:bg-ink hover:text-base"
                            >
                              Export
                            </button>
                          </div>
                        </div>
                        <div className="pt-8 border-t border-ink">
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

                <div className="border-t border-ink pt-12">
                  <h3 className="text-2xl font-serif italic mb-8">Manual Answer Key</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-4">
                    {Object.keys(answerKey).sort((a, b) => parseInt(a) - parseInt(b)).map(q => (
                      <div key={q} className="border border-ink p-3 space-y-2 group hover:bg-ink hover:text-base transition-all">
                        <span className="text-[10px] font-mono opacity-50 block">{q}</span>
                        <select 
                          value={answerKey[q]}
                          onChange={(e) => updateAnswerKey(q, e.target.value)}
                          className="bg-transparent w-full text-lg font-bold font-mono focus:outline-none appearance-none cursor-pointer"
                        >
                          {["A", "B", "C", "D", "E"].map(opt => (
                            <option key={opt} value={opt} className="text-ink">{opt}</option>
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
                      <h2 className="text-4xl sm:text-5xl font-serif italic">Result Detail</h2>
                      <span className={cn(
                        "px-3 py-1 text-[10px] font-mono uppercase tracking-widest border",
                        currentResult.is_passing ? "border-green-600 text-green-600" : "border-red-600 text-red-600"
                      )}>
                        {currentResult.is_passing ? "Pass" : "Fail"}
                      </span>
                    </div>
                    <p className="text-sm opacity-50 mt-2 uppercase tracking-widest">
                      Candidate #{currentResult.candidate_number} 
                      {(() => {
                        const matchedCandidate = candidates.find(c => c.candidate_id === currentResult.candidate_number || c.candidate_id === currentResult.candidate_id);
                        if (matchedCandidate) {
                          return ` - ${matchedCandidate.name} ${matchedCandidate.surname}`;
                        }
                        if (currentResult.candidate_id && currentResult.candidate_id !== "Unknown") {
                          return ` (${currentResult.candidate_id})`;
                        }
                        return "";
                      })()} • 
                      Score: <span className="text-ink font-bold">{currentResult.score}/{currentResult.max_score || "-"}</span> • 
                      Confidence: {currentResult.confidence ? (currentResult.confidence * 100).toFixed(1) + "%" : "N/A"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:gap-4 w-full md:w-auto">
                    <button 
                      onClick={async () => {
                        try {
                          const imgsStr = await idbGet(`images_${currentResult.id}`);
                          const imgs = imgsStr ? JSON.parse(imgsStr) : [];
                          if (imgs && imgs.length > 0) {
                            setViewImages(imgs);
                          } else {
                            setConfirmDialog({
                              message: "Original images not found for this result. They might have been deleted or were too large to save locally.",
                              onConfirm: () => setConfirmDialog(null)
                            });
                          }
                        } catch (e) {
                          setConfirmDialog({
                            message: "Failed to load original images.",
                            onConfirm: () => setConfirmDialog(null)
                          });
                        }
                      }}
                      className="flex-1 md:flex-none justify-center text-[10px] lg:text-xs font-mono uppercase border border-ink px-3 lg:px-4 py-2 hover:bg-ink hover:text-base transition-all flex items-center gap-2"
                    >
                      <Eye size={14} /> View Original
                    </button>
                    <button 
                      onClick={exportSingleResult}
                      className="flex-1 md:flex-none justify-center text-[10px] lg:text-xs font-mono uppercase border border-ink px-3 lg:px-4 py-2 hover:bg-ink hover:text-base transition-all"
                    >
                      Export CSV
                    </button>
                    <button 
                      onClick={() => setActiveTab("correct")}
                      className="flex-1 md:flex-none justify-center text-[10px] lg:text-xs font-mono uppercase border border-ink px-3 lg:px-4 py-2 hover:bg-ink hover:text-base transition-all"
                    >
                      New Upload
                    </button>
                    <button 
                      onClick={() => setActiveTab("history")}
                      className="w-full md:w-auto justify-center text-[10px] lg:text-xs font-mono uppercase bg-ink text-base px-3 lg:px-4 py-2 hover:opacity-80 transition-all"
                    >
                      Back to History
                    </button>
                  </div>
                </div>

                <div className={cn("grid gap-4 mb-12", unsureCount > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-3")}>
                  <div className="border border-green-600/30 bg-green-600/5 p-4 sm:p-6 flex flex-col items-center justify-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-green-700 opacity-70">Correct</span>
                    <span className="text-3xl sm:text-4xl font-serif italic text-green-700">{correctCount}</span>
                  </div>
                  <div className="border border-red-600/30 bg-red-600/5 p-4 sm:p-6 flex flex-col items-center justify-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-red-700 opacity-70">Incorrect</span>
                    <span className="text-3xl sm:text-4xl font-serif italic text-red-700">{incorrectCount}</span>
                  </div>
                  <div className="border border-amber-600/30 bg-amber-600/5 p-4 sm:p-6 flex flex-col items-center justify-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-amber-700 opacity-70">Unanswered</span>
                    <span className="text-3xl sm:text-4xl font-serif italic text-amber-700">{unansweredCount}</span>
                  </div>
                  {unsureCount > 0 && (
                    <div className="border border-purple-600/30 bg-purple-600/5 p-4 sm:p-6 flex flex-col items-center justify-center relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-purple-600 animate-pulse" />
                      <span className="text-[10px] uppercase font-mono tracking-widest text-purple-700 opacity-70 text-center">Unsure (Review)</span>
                      <span className="text-3xl sm:text-4xl font-serif italic text-purple-700">{unsureCount}</span>
                    </div>
                  )}
                </div>

                {unsureCount > 0 && (
                  <div className="mb-12 border border-purple-600/30 bg-purple-600/5 p-6">
                    <h3 className="text-xl font-serif italic text-purple-800 mb-4 flex items-center gap-2">
                      <AlertCircle size={20} />
                      Requires Examiner Attention
                    </h3>
                    <p className="text-sm text-purple-800/70 mb-4">
                      The AI was unsure about the following questions due to faint marks, multiple marks, or ambiguity. Please verify them manually.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {currentResult.answers._unsure.map((q: string) => (
                        <button 
                          key={q} 
                          onClick={() => setBreakdownQuestion(q)}
                          className="px-3 py-1 bg-purple-600 text-white text-xs font-mono font-bold rounded-full hover:bg-purple-700 transition-colors cursor-pointer"
                        >
                          Q{q}: {currentResult.answers[q] || "Empty"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {Object.keys(answerKey).sort((a, b) => parseInt(a) - parseInt(b)).map(q => {
                    const studentAns = currentResult.answers[q];
                    const correctAns = answerKey[q];
                    const isCorrect = studentAns === correctAns;
                    const isUnsure = currentResult.answers?._unsure?.includes(q);

                    return (
                      <div 
                        key={q} 
                        onClick={() => setBreakdownQuestion(q)}
                        className={cn(
                          "border p-4 flex flex-col gap-2 transition-all relative cursor-pointer hover:shadow-md",
                          isCorrect ? "border-green-600/30 bg-green-600/5 hover:bg-green-600/10" : 
                          !studentAns ? "border-amber-600/30 bg-amber-600/5 hover:bg-amber-600/10" : "border-red-600/30 bg-red-600/5 hover:bg-red-600/10",
                          isUnsure && "ring-2 ring-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                        )}
                      >
                        {isUnsure && (
                          <div className="absolute -top-2 -right-2 bg-purple-600 text-white text-[8px] uppercase font-bold px-2 py-1 rounded-full animate-pulse">
                            Review
                          </div>
                        )}
                        <div className="flex justify-between items-center border-b border-ink/10 pb-2">
                          <span className="text-xs font-mono font-bold uppercase flex items-center gap-1">
                            Question {q}
                            {isUnsure && <AlertCircle size={12} className="text-purple-600" />}
                          </span>
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
                            <span className="text-lg font-bold font-mono text-ink">
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
            {activeTab === "candidates" && (
              <motion.div 
                key="candidates"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto space-y-12"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-ink pb-8">
                  <div className="space-y-2">
                    <h2 className="text-3xl sm:text-4xl font-serif italic">Candidates</h2>
                    <p className="font-mono text-xs opacity-50 uppercase tracking-widest">Manage Candidate List</p>
                  </div>
                  <div className="flex gap-4 w-full sm:w-auto">
                    <label className="flex-1 sm:flex-none border border-ink px-4 py-2 uppercase text-[10px] font-mono tracking-widest hover:bg-ink hover:text-base transition-all cursor-pointer text-center">
                      Import CSV
                      <input type="file" accept=".csv" className="hidden" onChange={handleCandidateCsvUpload} />
                    </label>
                    <button 
                      onClick={async () => {
                        if (confirm("Are you sure you want to clear all candidates?")) {
                          await db.clearCandidates();
                          fetchCandidates();
                        }
                      }}
                      className="flex-1 sm:flex-none border border-red-600 text-red-600 px-4 py-2 uppercase text-[10px] font-mono tracking-widest hover:bg-red-600 hover:text-white transition-all"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="border border-ink bg-card overflow-hidden shadow-[4px_4px_0px_0px_var(--shadow)]">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-ink bg-ink text-base">
                          <th className="p-4 font-mono text-xs uppercase tracking-widest font-normal">Candidate ID</th>
                          <th className="p-4 font-mono text-xs uppercase tracking-widest font-normal">Surname</th>
                          <th className="p-4 font-mono text-xs uppercase tracking-widest font-normal">Name</th>
                          <th className="p-4 font-mono text-xs uppercase tracking-widest font-normal text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidates.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-8 text-center opacity-50 font-mono text-sm">
                              No candidates imported yet. Upload a CSV with columns: name, surname, candidate_id.
                            </td>
                          </tr>
                        ) : (
                          candidates.map((c, i) => (
                            <tr key={i} className="border-b border-ink/20 hover:bg-ink/5 transition-colors">
                              <td className="p-4 font-mono text-sm font-bold">{c.candidate_id}</td>
                              <td className="p-4 font-serif">{c.surname}</td>
                              <td className="p-4 font-serif">{c.name}</td>
                              <td className="p-4 text-right">
                                <button 
                                  onClick={async () => {
                                    if (confirm("Delete this candidate?")) {
                                      await db.deleteCandidate(c.candidate_id);
                                      fetchCandidates();
                                    }
                                  }}
                                  className="text-red-600 hover:opacity-50 transition-opacity"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Breakdown Modal */}
      {breakdownQuestion && (
        <div className="fixed inset-0 bg-ink/90 z-50 flex items-center justify-center p-6">
          <div className="bg-base w-full max-w-2xl border border-ink p-8 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-serif italic">Question {breakdownQuestion} Breakdown</h3>
              <button onClick={() => setBreakdownQuestion(null)} className="hover:opacity-50"><XCircle size={24} /></button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm opacity-70">
                Correct Answer: <span className="font-bold text-ink">{answerKey[breakdownQuestion]}</span>
              </p>
              
              <div className="border border-ink/20 p-4 space-y-4">
                {(() => {
                  const { breakdown, total } = getQuestionBreakdown(breakdownQuestion);
                  if (total === 0) return <p className="text-sm opacity-50">No results available.</p>;
                  
                  return Object.entries(breakdown).sort((a, b) => b[1] - a[1]).map(([ans, count]) => (
                    <div key={ans} className="space-y-1">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="uppercase">{ans === "Unanswered" ? ans : `Answer ${ans}`}</span>
                        <span>{count} ({((count / total) * 100).toFixed(1)}%)</span>
                      </div>
                      <div className="w-full h-2 bg-ink/10 overflow-hidden">
                        <div 
                          className={cn(
                            "h-full",
                            ans === answerKey[breakdownQuestion] ? "bg-green-600" : 
                            ans === "Unanswered" ? "bg-amber-600" : "bg-red-600"
                          )}
                          style={{ width: `${(count / total) * 100}%` }}
                        />
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
            
            <button 
              onClick={() => setBreakdownQuestion(null)}
              className="w-full border border-ink py-3 uppercase text-[10px] font-mono tracking-widest hover:bg-ink hover:text-base"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* CSV Preview Modal */}
      {csvPreview && (
        <div className="fixed inset-0 bg-ink/90 z-50 flex items-center justify-center p-6">
          <div className="bg-base w-full max-w-2xl border border-ink p-8 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-serif italic">Import Preview</h3>
              <button onClick={() => setCsvPreview(null)} className="hover:opacity-50"><Trash2 size={24} /></button>
            </div>
            <p className="text-sm opacity-70">Detected {Object.keys(csvPreview).length} questions. Confirm to overwrite current answer key.</p>
            <div className="max-h-64 overflow-y-auto border border-ink p-4">
              <div className="grid grid-cols-5 gap-2">
                {Object.keys(csvPreview).sort((a, b) => parseInt(a) - parseInt(b)).map(q => (
                  <div key={q} className="text-[10px] font-mono border border-ink/20 p-1 flex justify-between">
                    <span className="opacity-50">{q}:</span>
                    <span className="font-bold">{csvPreview[q]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setCsvPreview(null)}
                className="flex-1 border border-ink py-3 uppercase text-[10px] font-mono tracking-widest hover:bg-ink hover:text-base"
              >
                Cancel
              </button>
              <button 
                onClick={confirmImport}
                className="flex-1 bg-ink text-base py-3 uppercase text-[10px] font-mono tracking-widest hover:opacity-80"
              >
                Confirm Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 bg-ink/90 z-50 flex items-center justify-center p-6">
          <div className="bg-base w-full max-w-2xl border border-ink p-8 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-serif italic">Capture Sheet</h3>
              <button onClick={() => setShowCamera(false)} className="hover:opacity-50"><Trash2 size={24} /></button>
            </div>
            
            <div className="relative aspect-[3/4] bg-black border border-ink flex items-center justify-center overflow-hidden">
              {!capturedImage ? (
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <img 
                  src={capturedImage} 
                  alt="Captured sheet" 
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {!capturedImage ? (
              <button 
                onClick={capturePhoto}
                className="w-full bg-ink text-base py-4 uppercase tracking-widest text-sm hover:opacity-80 transition-opacity"
              >
                Capture Photo
              </button>
            ) : (
              <div className="flex gap-4">
                <button 
                  onClick={retakePhoto}
                  className="flex-1 border border-ink py-4 uppercase tracking-widest text-sm hover:bg-ink hover:text-base transition-colors"
                >
                  Retake
                </button>
                <button 
                  onClick={analyzeCapturedPhoto}
                  className="flex-1 bg-ink text-base py-4 uppercase tracking-widest text-sm hover:opacity-80 transition-opacity"
                >
                  Analyze
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Prompt Dialog */}
      {promptDialog && (
        <div className="fixed inset-0 bg-ink/90 z-50 flex items-center justify-center p-6">
          <div className="bg-base w-full max-w-md border border-ink p-8 space-y-6">
            <h3 className="text-2xl font-serif italic">{promptDialog.title}</h3>
            <p className="font-mono text-sm opacity-80">{promptDialog.message}</p>
            <div className="flex flex-col gap-3 pt-4">
              {promptDialog.options.map((opt, i) => (
                <button 
                  key={i}
                  onClick={opt.onClick}
                  className={cn("w-full py-3 uppercase text-[10px] font-mono tracking-widest transition-colors", opt.className || "border border-ink hover:bg-ink hover:text-base")}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-ink/90 z-50 flex items-center justify-center p-6">
          <div className="bg-base w-full max-w-md border border-ink p-8 space-y-6">
            <h3 className="text-2xl font-serif italic">Confirm Action</h3>
            <p className="font-mono text-sm opacity-80">{confirmDialog.message}</p>
            <div className="flex gap-4 pt-4">
              <button 
                onClick={() => setConfirmDialog(null)}
                className="flex-1 border border-ink py-3 uppercase text-[10px] font-mono tracking-widest hover:bg-ink hover:text-base"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDialog.onConfirm}
                className="flex-1 bg-red-600 text-white py-3 uppercase text-[10px] font-mono tracking-widest hover:bg-red-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Images Modal */}
      {viewImages && (
        <div className="fixed inset-0 bg-ink/95 z-50 flex flex-col p-6 overflow-y-auto">
          <div className="flex justify-between items-center mb-6 text-base">
            <h3 className="text-2xl font-serif italic">Original Document</h3>
            <button onClick={() => setViewImages(null)} className="hover:opacity-50 p-2">
              <Trash2 size={24} className="hidden" /> {/* Placeholder for alignment */}
              <span className="font-mono uppercase tracking-widest text-sm border border-base px-4 py-2 hover:bg-base hover:text-ink transition-colors">Close</span>
            </button>
          </div>
          <div className="flex flex-col gap-8 items-center pb-12">
            {viewImages.map((img, idx) => (
              <div key={idx} className="w-full max-w-4xl bg-card p-2">
                <div className="text-ink font-mono text-xs uppercase tracking-widest mb-2 opacity-50">Page {idx + 1}</div>
                <img src={img} alt={`Page ${idx + 1}`} className="w-full h-auto border border-ink" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-ink p-4 flex justify-between items-center text-[10px] uppercase tracking-[0.2em] font-mono">
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
