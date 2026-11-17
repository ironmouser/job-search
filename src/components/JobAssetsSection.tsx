'use client';

import { useState } from 'react';
import NetworkingAssetCard from './NetworkingAssetCard';
import CoverLetterAssetCard from './CoverLetterAssetCard';
import ResumeAssetCard from './ResumeAssetCard';
import AssetFormatToggle from './AssetFormatToggle';
import { AssetFormat } from '@/lib/docxGeneratorHelper';

interface JobAssetsSectionProps {
    jobId: string;
    assets: {
        networkingMessage?: string | null;
        previousNetworkingMessage?: string | null;
        networkingMessageRegensUsed?: number | null;
        coverLetterMarkdown?: string | null;
        previousCoverLetterMarkdown?: string | null;
        coverLetterRegensUsed?: number | null;
        tailoredResumeMarkdown?: string | null;
        previousTailoredResumeMarkdown?: string | null;
        resumeRegensUsed?: number | null;
    };
    planTier: string;
    preferences: any;
    userName?: string;
    userLocation?: string;
    userPhone?: string;
    userEmail?: string;
    companyName?: string;
    companyLocation?: string;
    gap?: string;
}

export default function JobAssetsSection({
    jobId,
    assets,
    planTier,
    preferences,
    userName,
    userLocation,
    userPhone,
    userEmail,
    companyName,
    companyLocation,
    gap = '1.5rem',
}: JobAssetsSectionProps) {
    const [assetFormat, setAssetFormat] = useState<AssetFormat>(
        preferences?.preferredAssetFormat === 'docx' ? 'docx' : 'pdf'
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                }}
            >
                <AssetFormatToggle
                    format={assetFormat}
                    onChange={setAssetFormat}
                    persistOnToggle={true}
                />
            </div>

            <NetworkingAssetCard
                jobId={jobId}
                initialContent={assets.networkingMessage || ''}
                initialPreviousContent={assets.previousNetworkingMessage || undefined}
                initialRegensUsed={assets.networkingMessageRegensUsed || 0}
                planTier={planTier}
                initialTone={preferences?.networkingMessageTone || 'Confident and strategic'}
                assetFormat={assetFormat}
            />

            <CoverLetterAssetCard
                jobId={jobId}
                initialContent={assets.coverLetterMarkdown || ''}
                initialPreviousContent={assets.previousCoverLetterMarkdown || undefined}
                initialRegensUsed={assets.coverLetterRegensUsed || 0}
                planTier={planTier}
                initialTone={preferences?.coverLetterTone || 'Confident and strategic'}
                userName={userName}
                userLocation={userLocation}
                userPhone={userPhone}
                userEmail={userEmail}
                companyName={companyName}
                companyLocation={companyLocation}
                assetFormat={assetFormat}
                initialPdfSettings={{
                    template: preferences?.coverLetterPdfTemplate || 'classic',
                    fontFamily: preferences?.coverLetterPdfFontFamily || 'Helvetica, Arial, sans-serif',
                    fontSize: preferences?.coverLetterPdfFontSize || '11pt',
                    lineHeight: preferences?.coverLetterPdfLineHeight || '1.5',
                    primaryColor: preferences?.coverLetterPdfPrimaryColor || '#1e3a8a',
                    textColor: preferences?.coverLetterPdfTextColor || '#111827',
                    margin: preferences?.coverLetterPdfMargin || '0.5in',
                    headerLayout: preferences?.coverLetterPdfHeaderLayout || 'left',
                }}
            />

            <ResumeAssetCard
                jobId={jobId}
                initialContent={assets.tailoredResumeMarkdown || ''}
                initialPreviousContent={assets.previousTailoredResumeMarkdown || undefined}
                initialRegensUsed={assets.resumeRegensUsed || 0}
                planTier={planTier}
                initialCustomization={preferences?.resumeCustomizationMaxPercentage || 50}
                assetFormat={assetFormat}
                initialPdfSettings={{
                    template: preferences?.resumePdfTemplate || 'classic',
                    fontFamily: preferences?.resumePdfFontFamily || 'Helvetica, Arial, sans-serif',
                    fontSize: preferences?.resumePdfFontSize || '11pt',
                    lineHeight: preferences?.resumePdfLineHeight || '1.5',
                    primaryColor: preferences?.resumePdfPrimaryColor || '#1e3a8a',
                    textColor: preferences?.resumePdfTextColor || '#111827',
                    margin: preferences?.resumePdfMargin || '0.5in',
                    headerLayout: preferences?.resumePdfHeaderLayout || 'left',
                }}
            />
        </div>
    );
}
