import React, { useState, useCallback } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';

export function UploadWorkspace({ onUploadSuccess }: { onUploadSuccess: (id: string, url: string) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      await processFile(file);
    }
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const processFile = async (file: File) => {
    setIsUploading(true);
    setError(null);
    try {
      // 1. In a real app, upload to Supabase Storage here.
      // const { data, error } = await supabase.storage.from('exams').upload(file.name, file);

      // For MVP, create a fake URL or local blob URL
      const fileUrl = URL.createObjectURL(file);

      // 2. Call our API gateway or background service
      // We are directly calling the Python service here for demo purposes
      const response = await fetch('http://localhost:8000/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_id: crypto.randomUUID(),
          file_url: fileUrl,
          expected_pages: 1,
          config: { num_questions: 100, options: ["A", "B", "C", "D", "E"] }
        })
      });

      if (!response.ok) throw new Error("Processing failed");

      const result = await response.json();

      // Move to next step
      onUploadSuccess(result.submission_id, fileUrl);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-xl shadow-sm border border-gray-200">
      <h2 className="text-xl font-semibold mb-4">Upload Answer Sheet</h2>

      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center hover:bg-gray-50 transition-colors cursor-pointer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-upload')?.click()}
      >
        <input
          id="file-upload"
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />

        {isUploading ? (
          <div className="flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
            <p className="text-gray-600">Uploading and Processing...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <Upload className="w-10 h-10 text-gray-400 mb-4" />
            <p className="text-gray-700 font-medium">Click to upload or drag and drop</p>
            <p className="text-gray-500 text-sm mt-1">PDF, PNG, or JPG (max. 10MB)</p>
          </div>
        )}
      </div>

      {error && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">{error}</div>}
    </div>
  );
}
