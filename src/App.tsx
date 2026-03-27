import React, { useState } from 'react';
import { UploadWorkspace } from './components/UploadWorkspace';
import { AuditSplitView } from './components/AuditSplitView';
import { CheckCircle2, ChevronRight, FileText, Settings, HelpCircle } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState<'upload' | 'audit'>('upload');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);

  // Dummy function for now to handle successful upload
  const handleUploadSuccess = (submissionId: string, url: string) => {
    setUploadedImage(url);
    
    // Create some fake data to test the audit view
    const fakeResults = Array.from({ length: 100 }, (_, i) => {
      const q = i + 1;
      const r = Math.random();
      if (r < 0.05) {
        return { question: q, detected_answer: ['A', 'B'], status: 'ambiguous', confidence: 0.3, reason: 'Erasure likely' };
      } else if (r < 0.1) {
        return { question: q, detected_answer: null, status: 'blank', confidence: 0.95, reason: 'Empty bubble' };
      } else {
        const ans = ['A', 'B', 'C', 'D', 'E'][Math.floor(Math.random() * 5)];
        return { question: q, detected_answer: ans, status: 'answered', confidence: 0.8 + Math.random() * 0.2, reason: 'Single mark' };
      }
    });
    
    setResults(fakeResults);
    setActiveTab('audit');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold text-lg">
                E
              </div>
              <span className="text-xl font-bold text-gray-900 tracking-tight">ExamChecker Pro</span>
            </div>

            <nav className="flex space-x-8">
              <button 
                onClick={() => setActiveTab('upload')}
                className={`flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${activeTab === 'upload' ? 'border-blue-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Scans
              </button>
              <button 
                onClick={() => setActiveTab('audit')}
                disabled={!uploadedImage}
                className={`flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${!uploadedImage ? 'opacity-50 cursor-not-allowed' : activeTab === 'audit' ? 'border-blue-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
              >
                <FileText className="w-4 h-4 mr-2" />
                Audit Trail
              </button>
            </nav>

            <div className="flex items-center space-x-4">
               <button className="text-gray-400 hover:text-gray-600"><HelpCircle className="w-5 h-5"/></button>
               <button className="text-gray-400 hover:text-gray-600"><Settings className="w-5 h-5"/></button>
               <div className="w-8 h-8 rounded-full bg-gray-200 border border-gray-300"></div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'upload' ? (
          <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
             <UploadWorkspace onUploadSuccess={handleUploadSuccess} />
          </div>
        ) : (
          uploadedImage && <AuditSplitView fileUrl={uploadedImage} results={results} />
        )}
      </main>
    </div>
  );
}

// Temporary inline components since we aren't exporting them from lucide-react yet
function Upload(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>; }

export default App;
