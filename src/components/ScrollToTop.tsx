import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

export const ScrollToTop: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      
      // Calculate progress percentage
      if (scrollHeight > 0) {
        const progress = Math.min(100, Math.max(0, Math.round((scrollTop / scrollHeight) * 100)));
        setScrollProgress(progress);
      }

      // Show button when scrolled past 200px
      if (scrollTop > 200) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
    if (document.documentElement) {
      document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (document.body) {
      document.body.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 no-print flex flex-col items-center gap-1">
      <button
        id="btn-scroll-to-top"
        type="button"
        onClick={scrollToTop}
        aria-label="العودة للأعلى"
        title="العودة لأعلى الصفحة"
        className="group relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-xl hover:shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 border-2 border-white/80 focus:outline-none focus:ring-4 focus:ring-blue-400/40"
      >
        {/* Subtle circular SVG progress ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90 p-0.5 pointer-events-none" viewBox="0 0 48 48">
          <circle
            cx="24"
            cy="24"
            r="20"
            className="text-white/20 stroke-current"
            strokeWidth="2.5"
            fill="transparent"
          />
          <circle
            cx="24"
            cy="24"
            r="20"
            className="text-white stroke-current transition-all duration-150"
            strokeWidth="2.5"
            strokeDasharray={125.66}
            strokeDashoffset={125.66 - (125.66 * scrollProgress) / 100}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>

        <ArrowUp 
          size={22} 
          className="relative z-10 transition-transform duration-300 group-hover:-translate-y-0.5" 
        />

        {/* Tooltip on Hover */}
        <span className="absolute bottom-full mb-2 hidden group-hover:flex items-center gap-1 bg-gray-900/90 text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-lg whitespace-nowrap backdrop-blur-xs pointer-events-none transition-all">
          <span>للأعلى</span>
          <span className="text-[10px] text-blue-200">({scrollProgress}%)</span>
        </span>
      </button>
    </div>
  );
};
