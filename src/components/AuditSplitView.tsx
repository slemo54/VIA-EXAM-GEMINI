import React, { useState } from 'react';
import { ZoomIn, ZoomOut, AlertCircle } from 'lucide-react';

interface BubbleResult {
  question: int;
  detected_answer: string | string[] | null;
  status: 'answered' | 'blank' | 'ambiguous';
  confidence: number;
  reason: string;
}

export function AuditSplitView({ fileUrl, results }: { fileUrl: string, results: BubbleResult[] }) {
  const [zoom, setZoom] = useState(1);
  const [filter, setFilter] = useState<'all' | 'ambiguous' | 'blank'>('all');
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null);

  const filteredResults = results.filter(r => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  return (
    <div className="flex h-screen bg-gray-50 border-t border-gray-200">

      {/* LEFT PANEL: Data Table */}
      <div className="w-1/3 border-r border-gray-200 bg-white flex flex-col overflow-hidden shadow-sm">

        {/* Header & Filters */}
        <div className="p-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800">Audit Trail</h2>
          <div className="flex space-x-2 mt-3">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${filter === 'all' ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              All ({results.length})
            </button>
            <button
              onClick={() => setFilter('ambiguous')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${filter === 'ambiguous' ? 'bg-orange-100 text-orange-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Ambiguous ({results.filter(r => r.status === 'ambiguous').length})
            </button>
            <button
              onClick={() => setFilter('blank')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${filter === 'blank' ? 'bg-gray-200 text-gray-800 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Blank ({results.filter(r => r.status === 'blank').length})
            </button>
          </div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Q#</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ans</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Conf</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredResults.map((res) => (
                <tr
                  key={res.question}
                  onClick={() => setSelectedQuestion(res.question)}
                  className={`cursor-pointer hover:bg-blue-50 transition-colors ${selectedQuestion === res.question ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {res.question}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {res.status === 'ambiguous' ? (
                       <span className="flex items-center text-orange-600 font-medium bg-orange-50 px-2 py-1 rounded-md w-max">
                         <AlertCircle className="w-4 h-4 mr-1" />
                         {Array.isArray(res.detected_answer) ? res.detected_answer.join(', ') : '???'}
                       </span>
                    ) : res.status === 'blank' ? (
                       <span className="text-gray-400 italic">Blank</span>
                    ) : (
                       <span className="text-gray-900 font-semibold">{res.detected_answer}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-1.5 mr-2">
                        <div
                          className={`h-1.5 rounded-full ${res.confidence > 0.8 ? 'bg-green-500' : res.confidence > 0.4 ? 'bg-orange-500' : 'bg-red-500'}`}
                          style={{ width: `${res.confidence * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-gray-500 text-xs">{Math.round(res.confidence * 100)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT PANEL: Image Viewer */}
      <div className="w-2/3 bg-gray-900 relative flex items-center justify-center overflow-hidden">

        {/* Controls */}
        <div className="absolute top-4 right-4 bg-white rounded-md shadow-lg flex space-x-1 p-1 z-20">
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-2 text-gray-600 hover:bg-gray-100 rounded">
            <ZoomOut className="w-5 h-5" />
          </button>
          <button onClick={() => setZoom(1)} className="p-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-2 text-gray-600 hover:bg-gray-100 rounded">
            <ZoomIn className="w-5 h-5" />
          </button>
        </div>

        {/* Image Container */}
        <div
          className="absolute transition-transform duration-200 origin-center"
          style={{ transform: `scale(${zoom})` }}
        >
          {/* In a real app, this image would have bounding boxes drawn on it either server-side or via SVG overlays */}
          <img
            src={fileUrl}
            alt="Annotated Exam"
            className="max-w-none shadow-2xl"
            style={{ maxHeight: '90vh' }}
          />
        </div>

      </div>
    </div>
  );
}
