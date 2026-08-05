"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Direction = 'next' | 'prev' | null;

interface NavContextType {
  direction: Direction;
  triggerNavigate: (dir: 'next' | 'prev', targetUrl: string, onBeforePush?: () => void) => void;
}

const NavContext = createContext<NavContextType>({
  direction: null,
  triggerNavigate: () => {},
});

export const useJobNav = () => useContext(NavContext);

export default function JobDetailsNavWrapper({ jobId, children }: { jobId: string; children: ReactNode }) {
  const [direction, setDirection] = useState<Direction>(null);
  const [animClass, setAnimClass] = useState<string>('');

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

  return (
    <NavContext.Provider value={{ direction, triggerNavigate }}>
      <div className={`job-nav-wrapper ${animClass}`}>
        {children}
      </div>
    </NavContext.Provider>
  );
}
