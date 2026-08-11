"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';

type Direction = 'next' | 'prev' | null;

interface NavContextType {
  direction: Direction;
  triggerNavigate: (dir: 'next' | 'prev', targetUrl: string, onBeforePush?: () => void) => void;
  registerSwipeHandlers: (onNext: (() => void) | null, onPrev: (() => void) | null) => void;
}

const NavContext = createContext<NavContextType>({
  direction: null,
  triggerNavigate: () => {},
  registerSwipeHandlers: () => {},
});

export const useJobNav = () => useContext(NavContext);

export default function JobDetailsNavWrapper({ jobId, children }: { jobId: string; children: ReactNode }) {
  const [direction, setDirection] = useState<Direction>(null);
  const [animClass, setAnimClass] = useState<string>('');

  const swipeNextRef = useRef<(() => void) | null>(null);
  const swipePrevRef = useRef<(() => void) | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const registerSwipeHandlers = useCallback((onNext: (() => void) | null, onPrev: (() => void) | null) => {
    swipeNextRef.current = onNext;
    swipePrevRef.current = onPrev;
  }, []);

  useEffect(() => {
    // When jobId changes, determine slide-in class based on stored direction
    const lastDir = (sessionStorage.getItem('job_nav_direction') as Direction) || null;
    if (lastDir === 'next') {
      setAnimClass('job-slide-in-right');
    } else if (lastDir === 'prev') {
      setAnimClass('job-slide-in-left');
    }
    // Clean up session storage after applying initial transition
    sessionStorage.removeItem('job_nav_direction');

    const timer = setTimeout(() => {
      setAnimClass('');
      setDirection(null);
    }, 400);

    return () => clearTimeout(timer);
  }, [jobId]);

  const triggerNavigate = (dir: 'next' | 'prev', targetUrl: string, onBeforePush?: () => void) => {
    setDirection(dir);
    sessionStorage.setItem('job_nav_direction', dir);

    // Apply slide out animation class
    if (dir === 'next') {
      setAnimClass('job-slide-out-left');
    } else {
      setAnimClass('job-slide-out-right');
    }

    if (onBeforePush) onBeforePush();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const target = e.target as HTMLElement;

    // Ignore touches on form controls, buttons, links, or modals/popovers
    if (target.closest('input, textarea, select, button, a, [role="dialog"], .job-fab-menu, .modal-backdrop')) {
      touchStartRef.current = null;
      return;
    }

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length !== 1) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    // Check conditions for horizontal swipe gesture:
    // 1. Gesture completed within 500ms
    // 2. Horizontal distance >= 60px
    // 3. Dominantly horizontal (Math.abs(deltaX) > Math.abs(deltaY) * 1.5)
    if (deltaTime > 500) return;
    if (Math.abs(deltaX) < 60) return;
    if (Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;

    // Swipe Left -> Next Job
    if (deltaX < -60 && swipeNextRef.current) {
      swipeNextRef.current();
    }
    // Swipe Right -> Previous Job
    else if (deltaX > 60 && swipePrevRef.current) {
      swipePrevRef.current();
    }
  };

  return (
    <NavContext.Provider value={{ direction, triggerNavigate, registerSwipeHandlers }}>
      <div
        className={`job-nav-wrapper ${animClass}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </NavContext.Provider>
  );
}
