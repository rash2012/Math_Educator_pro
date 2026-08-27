import React from 'react';
import { X, AlertTriangle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CustomDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  message: string;
  type?: 'confirm' | 'alert';
  confirmText?: string;
  cancelText?: string;
}

export const CustomDialog: React.FC<CustomDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'confirm',
  confirmText = 'تأكيد',
  cancelText = 'إلغاء',
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            dir="rtl"
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-full shrink-0 ${type === 'confirm' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                  {type === 'confirm' ? <AlertTriangle size={24} /> : <Info size={24} />}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
                  <p className="text-gray-600 leading-relaxed">{message}</p>
                </div>
                <button 
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            
            <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3">
              {type === 'confirm' && onConfirm ? (
                <>
                  <button
                    onClick={() => {
                      onConfirm();
                      onClose();
                    }}
                    className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-sm"
                  >
                    {confirmText}
                  </button>
                  <button
                    onClick={onClose}
                    className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                  >
                    {cancelText}
                  </button>
                </>
              ) : (
                <button
                  onClick={onClose}
                  className="px-8 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  حسناً
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
