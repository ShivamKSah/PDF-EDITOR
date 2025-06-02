import React, { useState, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { PDFDocument, rgb } from 'pdf-lib';
import { Upload, Download, Type, Eraser, Eye, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Set up PDF.js worker using Vite's import system
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface TextAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
}

interface BlurArea {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const PDFEditor = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [activeTool, setActiveTool] = useState<'select' | 'text' | 'blur' | 'erase'>('select');
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
  const [blurAreas, setBlurAreas] = useState<BlurArea[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [newText, setNewText] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [textColor, setTextColor] = useState('#000000');
  const [pdfLoading, setPdfLoading] = useState(false);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log('PDF loaded successfully with', numPages, 'pages');
    setNumPages(numPages);
    setCurrentPage(1);
    setPdfLoading(false);
    toast.success(`PDF loaded successfully! ${numPages} pages found.`);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('Error loading PDF:', error);
    setPdfLoading(false);
    toast.error('Failed to load PDF file. Please try again.');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    console.log('File selected:', file);
    
    if (file && file.type === 'application/pdf') {
      console.log('Valid PDF file detected, loading...');
      setPdfLoading(true);
      setPdfFile(file);
      setTextAnnotations([]);
      setBlurAreas([]);
      setCurrentPage(1);
      toast.success('PDF file selected, loading...');
    } else {
      toast.error('Please select a valid PDF file');
    }
  };

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current || activeTool !== 'text') return;
    
    console.log('Canvas clicked with text tool, text:', newText);
    
    if (!newText.trim()) {
      toast.error('Please enter text before placing it on the PDF');
      return;
    }
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / scale;
    const y = (event.clientY - rect.top) / scale;

    console.log('Adding text annotation at:', { x, y, text: newText });

    const annotation: TextAnnotation = {
      id: Date.now().toString(),
      x,
      y,
      text: newText,
      fontSize,
      color: textColor,
    };
    
    setTextAnnotations(prev => {
      const updated = [...prev, annotation];
      console.log('Updated text annotations:', updated);
      return updated;
    });
    setNewText('');
    toast.success('Text annotation added');
  }, [activeTool, newText, scale, fontSize, textColor]);

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    console.log('Mouse down with tool:', activeTool);
    
    if (activeTool === 'blur') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (event.clientX - rect.left) / scale;
        const y = (event.clientY - rect.top) / scale;
        console.log('Starting blur area at:', { x, y });
        setStartPoint({ x, y });
        setIsDrawing(true);
      }
    } else if (activeTool === 'erase') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (event.clientX - rect.left) / scale;
        const y = (event.clientY - rect.top) / scale;
        
        console.log('Erasing at:', { x, y });
        
        // Remove text annotations near click point
        setTextAnnotations(prev => {
          const filtered = prev.filter(annotation => {
            const distance = Math.sqrt(
              Math.pow(annotation.x - x, 2) + Math.pow(annotation.y - y, 2)
            );
            return distance > 30; // Remove if within 30px
          });
          console.log('Text annotations after erase:', filtered);
          return filtered;
        });
        
        // Remove blur areas that contain the click point
        setBlurAreas(prev => {
          const filtered = prev.filter(area => {
            return !(x >= area.x && x <= area.x + area.width && 
                    y >= area.y && y <= area.y + area.height);
          });
          console.log('Blur areas after erase:', filtered);
          return filtered;
        });
        
        toast.success('Annotation erased');
      }
    }
  }, [activeTool, scale]);

  const handleMouseUp = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    console.log('Mouse up, isDrawing:', isDrawing, 'tool:', activeTool);
    
    if (isDrawing && startPoint && canvasRef.current && activeTool === 'blur') {
      const rect = canvasRef.current.getBoundingClientRect();
      const endX = (event.clientX - rect.left) / scale;
      const endY = (event.clientY - rect.top) / scale;
      
      const width = Math.abs(endX - startPoint.x);
      const height = Math.abs(endY - startPoint.y);
      const x = Math.min(startPoint.x, endX);
      const y = Math.min(startPoint.y, endY);

      console.log('Blur area dimensions:', { x, y, width, height });

      if (width > 10 && height > 10) {
        const blurArea: BlurArea = {
          id: Date.now().toString(),
          x,
          y,
          width,
          height,
        };
        setBlurAreas(prev => {
          const updated = [...prev, blurArea];
          console.log('Updated blur areas:', updated);
          return updated;
        });
        toast.success('Blur area added');
      } else {
        toast.error('Blur area too small - drag a larger area');
      }
    }
    setIsDrawing(false);
    setStartPoint(null);
  }, [isDrawing, startPoint, activeTool, scale]);

  const removeAnnotation = (id: string, type: 'text' | 'blur') => {
    if (type === 'text') {
      setTextAnnotations(prev => prev.filter(ann => ann.id !== id));
    } else {
      setBlurAreas(prev => prev.filter(area => area.id !== id));
    }
    toast.success('Annotation removed');
  };

  const downloadModifiedPDF = async () => {
    if (!pdfFile) {
      toast.error('No PDF file loaded');
      return;
    }

    try {
      toast.info('Generating modified PDF...');
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pages = pdfDoc.getPages();
      const page = pages[currentPage - 1];

      // Add text annotations
      textAnnotations.forEach(annotation => {
        page.drawText(annotation.text, {
          x: annotation.x,
          y: page.getHeight() - annotation.y,
          size: annotation.fontSize,
          color: rgb(
            parseInt(annotation.color.slice(1, 3), 16) / 255,
            parseInt(annotation.color.slice(3, 5), 16) / 255,
            parseInt(annotation.color.slice(5, 7), 16) / 255
          ),
        });
      });

      // Add blur areas (as rectangles)
      blurAreas.forEach(area => {
        page.drawRectangle({
          x: area.x,
          y: page.getHeight() - area.y - area.height,
          width: area.width,
          height: area.height,
          color: rgb(0.8, 0.8, 0.8),
          opacity: 0.7,
        });
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `edited-document-page-${currentPage}.pdf`;
      link.click();
      
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded successfully!');
    } catch (error) {
      console.error('Error saving PDF:', error);
      toast.error('Failed to save PDF. Please try again.');
    }
  };

  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b p-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800">PDF Editor</h1>
          
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="flex items-center gap-2"
              disabled={pdfLoading}
            >
              <Upload className="w-4 h-4" />
              {pdfLoading ? 'Loading...' : 'Upload PDF'}
            </Button>
            
            {pdfFile && (
              <Button
                onClick={downloadModifiedPDF}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Download className="w-4 h-4" />
                Download
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar */}
        {pdfFile && (
          <div className="w-64 bg-white shadow-sm border-r p-4 overflow-y-auto">
            <div className="space-y-6">
              {/* Tools */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-3">Tools</h3>
                <div className="space-y-2">
                  <Button
                    variant={activeTool === 'select' ? 'default' : 'outline'}
                    className="w-full justify-start"
                    onClick={() => {
                      console.log('Selected tool: select');
                      setActiveTool('select');
                    }}
                  >
                    Select
                  </Button>
                  <Button
                    variant={activeTool === 'text' ? 'default' : 'outline'}
                    className="w-full justify-start"
                    onClick={() => {
                      console.log('Selected tool: text');
                      setActiveTool('text');
                    }}
                  >
                    <Type className="w-4 h-4 mr-2" />
                    Add Text
                  </Button>
                  <Button
                    variant={activeTool === 'blur' ? 'default' : 'outline'}
                    className="w-full justify-start"
                    onClick={() => {
                      console.log('Selected tool: blur');
                      setActiveTool('blur');
                    }}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Blur Area
                  </Button>
                  <Button
                    variant={activeTool === 'erase' ? 'default' : 'outline'}
                    className="w-full justify-start"
                    onClick={() => {
                      console.log('Selected tool: erase');
                      setActiveTool('erase');
                    }}
                  >
                    <Eraser className="w-4 h-4 mr-2" />
                    Erase
                  </Button>
                </div>
              </div>

              {/* Text Tool Settings */}
              {activeTool === 'text' && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3">Text Settings</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Text
                      </label>
                      <Input
                        value={newText}
                        onChange={(e) => {
                          console.log('Text input changed:', e.target.value);
                          setNewText(e.target.value);
                        }}
                        placeholder="Enter text..."
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Font Size
                      </label>
                      <Input
                        type="number"
                        value={fontSize}
                        onChange={(e) => setFontSize(Number(e.target.value))}
                        min="8"
                        max="72"
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Color
                      </label>
                      <input
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="w-full h-10 rounded border"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tool Instructions */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-3">Instructions</h3>
                <div className="text-sm text-gray-600 space-y-2">
                  {activeTool === 'text' && (
                    <p>Enter text above, then click on the PDF to place it.</p>
                  )}
                  {activeTool === 'blur' && (
                    <p>Click and drag on the PDF to create blur areas.</p>
                  )}
                  {activeTool === 'erase' && (
                    <p>Click on annotations to remove them.</p>
                  )}
                  {activeTool === 'select' && (
                    <p>Select this tool to navigate without editing.</p>
                  )}
                </div>
              </div>

              {/* Zoom Controls */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-3">Zoom</h3>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={zoomOut}
                    disabled={scale <= 0.5}
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium px-2">
                    {Math.round(scale * 100)}%
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={zoomIn}
                    disabled={scale >= 3.0}
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Annotations List */}
              {(textAnnotations.length > 0 || blurAreas.length > 0) && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3">Annotations ({textAnnotations.length + blurAreas.length})</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {textAnnotations.map(annotation => (
                      <Card key={annotation.id} className="p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm truncate">
                            {annotation.text}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAnnotation(annotation.id, 'text')}
                            className="h-6 w-6 p-0"
                          >
                            ×
                          </Button>
                        </div>
                      </Card>
                    ))}
                    {blurAreas.map(area => (
                      <Card key={area.id} className="p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Blur Area</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAnnotation(area.id, 'blur')}
                            className="h-6 w-6 p-0"
                          >
                            ×
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {pdfFile ? (
            <>
              {/* Page Navigation */}
              <div className="bg-white shadow-sm border-b p-4">
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium">
                    Page {currentPage} of {numPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, numPages))}
                    disabled={currentPage >= numPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* PDF Viewer */}
              <div className="flex-1 overflow-auto p-4">
                <div className="flex justify-center">
                  <div
                    ref={canvasRef}
                    className="relative inline-block shadow-lg rounded-lg overflow-hidden bg-white"
                    style={{ 
                      cursor: activeTool === 'text' ? 'crosshair' : 
                              activeTool === 'blur' ? 'crosshair' : 
                              activeTool === 'erase' ? 'pointer' : 'default'
                    }}
                    onClick={handleCanvasClick}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                  >
                    <Document
                      file={pdfFile}
                      onLoadSuccess={onDocumentLoadSuccess}
                      onLoadError={onDocumentLoadError}
                      loading={
                        <div className="flex items-center justify-center h-96 bg-gray-100">
                          <div className="text-gray-500">Loading PDF...</div>
                        </div>
                      }
                    >
                      <Page
                        pageNumber={currentPage}
                        scale={scale}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                      />
                    </Document>

                    {/* Text Annotations Overlay */}
                    {textAnnotations.map(annotation => (
                      <div
                        key={annotation.id}
                        className="absolute pointer-events-none"
                        style={{
                          left: annotation.x * scale,
                          top: annotation.y * scale,
                          fontSize: annotation.fontSize * scale,
                          color: annotation.color,
                          fontWeight: 'bold',
                          textShadow: '1px 1px 1px rgba(255,255,255,0.8)',
                        }}
                      >
                        {annotation.text}
                      </div>
                    ))}

                    {/* Blur Areas Overlay */}
                    {blurAreas.map(area => (
                      <div
                        key={area.id}
                        className="absolute pointer-events-none bg-gray-400 opacity-70 border-2 border-gray-600"
                        style={{
                          left: area.x * scale,
                          top: area.y * scale,
                          width: area.width * scale,
                          height: area.height * scale,
                          backdropFilter: 'blur(8px)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="mb-6">
                  <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h2 className="text-2xl font-semibold text-gray-700 mb-2">
                    Upload a PDF to get started
                  </h2>
                  <p className="text-gray-500">
                    Select a PDF file to view, edit, and annotate
                  </p>
                </div>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Choose PDF File
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
