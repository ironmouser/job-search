"use client";

import { useEffect } from "react";
import { trackJobDetailView } from "@/lib/analytics";

interface JobDetailTrackerProps {
  jobId: string;
  company?: string;
  title?: string;
  score?: number;
}

export default function JobDetailTracker({ jobId, company, title, score }: JobDetailTrackerProps) {
  useEffect(() => {
    trackJobDetailView(jobId, company, title, score);
  }, [jobId, company, title, score]);

  return null;
}
