'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';

export interface AutoApplySelectionState {
  count: number;
  isApplying?: boolean;
  onStartApply?: () => void | Promise<void>;
  onDeselectAll?: () => void;
  onArchiveDelete?: () => void;
}

export type DrawerTabType = 'auto-apply' | 'filters' | 'sync' | 'custom' | null;

interface CommandBarContextType {
  // Batch selection actions (Dashboard, Pipeline, etc.)
  selectionState: AutoApplySelectionState | null;
  setSelectionState: (state: AutoApplySelectionState | null) => void;

  // Custom page-level left/center actions
  pageActions: React.ReactNode | null;
  setPageActions: (actions: React.ReactNode | null) => void;

  // Drawer expansion and custom content
  isExpanded: boolean;
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  activeDrawerTab: DrawerTabType;
  setActiveDrawerTab: (tab: DrawerTabType) => void;
  drawerContent: React.ReactNode | null;
  setDrawerContent: (content: React.ReactNode | null) => void;

  // Auto-apply trigger & global refresh
  refreshTrigger: number;
  triggerRefresh: () => void;
}

const defaultContextValue: CommandBarContextType = {
  selectionState: null,
  setSelectionState: () => {},
  pageActions: null,
  setPageActions: () => {},
  isExpanded: false,
  setIsExpanded: () => {},
  activeDrawerTab: null,
  setActiveDrawerTab: () => {},
  drawerContent: null,
  setDrawerContent: () => {},
  refreshTrigger: 0,
  triggerRefresh: () => {},
};

const CommandBarContext = createContext<CommandBarContextType>(defaultContextValue);

export function AutoApplyBarProvider({ children }: { children: React.ReactNode }) {
  const [selectionState, _setSelectionState] = useState<AutoApplySelectionState | null>(null);
  const [pageActions, setPageActions] = useState<React.ReactNode | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeDrawerTab, setActiveDrawerTab] = useState<DrawerTabType>(null);
  const [drawerContent, setDrawerContent] = useState<React.ReactNode | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const prevCountRef = useRef<number | null>(null);

  const setSelectionState = useCallback((state: AutoApplySelectionState | null) => {
    _setSelectionState((prev) => {
      if (!prev && !state) return null;
      if (
        prev &&
        state &&
        prev.count === state.count &&
        prev.isApplying === state.isApplying &&
        prev.onStartApply === state.onStartApply &&
        prev.onDeselectAll === state.onDeselectAll &&
        prev.onArchiveDelete === state.onArchiveDelete
      ) {
        return prev;
      }
      return state;
    });
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const value = useMemo(
    () => ({
      selectionState,
      setSelectionState,
      pageActions,
      setPageActions,
      isExpanded,
      setIsExpanded,
      activeDrawerTab,
      setActiveDrawerTab,
      drawerContent,
      setDrawerContent,
      refreshTrigger,
      triggerRefresh,
    }),
    [
      selectionState,
      setSelectionState,
      pageActions,
      isExpanded,
      activeDrawerTab,
      drawerContent,
      refreshTrigger,
      triggerRefresh,
    ]
  );

  return (
    <CommandBarContext.Provider value={value}>
      {children}
    </CommandBarContext.Provider>
  );
}

export function useCommandBar(): CommandBarContextType {
  const context = useContext(CommandBarContext);
  return context ?? defaultContextValue;
}

// Backward compatibility alias
export const useAutoApplyBar = useCommandBar;
