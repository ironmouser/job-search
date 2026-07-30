import { marked } from 'marked';

export interface PdfStyleOptions {
    template?: string;
    fontFamily?: string;
    fontSize?: string;
    lineHeight?: string;
    primaryColor?: string;
    textColor?: string;
    margin?: string;
    headerLayout?: string; // 'left' | 'centered' | 'split'
}

export const PDF_TEMPLATES: Record<string, Required<Omit<PdfStyleOptions, 'template'>>> = {
    classic: {
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontSize: '11pt',
        lineHeight: '1.5',
        primaryColor: '#1e3a8a',
        textColor: '#111827',
        margin: '0.5in',
        headerLayout: 'left'
    },
    modern: {
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: '10.5pt',
        lineHeight: '1.45',
        primaryColor: '#1e3a8a',
        textColor: '#1f2937',
        margin: '0.4in',
        headerLayout: 'split'
    },
    executive: {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '11pt',
        lineHeight: '1.55',
        primaryColor: '#1e3a8a',
        textColor: '#111827',
        margin: '0.5in',
        headerLayout: 'centered'
    },
    tech: {
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: '10pt',
        lineHeight: '1.4',
        primaryColor: '#1e3a8a',
        textColor: '#0f172a',
        margin: '0.5in',
        headerLayout: 'left'
    },
    minimal: {
        fontFamily: 'Roboto, Arial, sans-serif',
        fontSize: '10.5pt',
        lineHeight: '1.5',
        primaryColor: '#1e3a8a',
        textColor: '#1f2937',
        margin: '0.6in',
        headerLayout: 'left'
    }
};

export function generateStyledPdfHtml(markdownText: string, options: PdfStyleOptions = {}): string {
    const templateKey = options.template && PDF_TEMPLATES[options.template] ? options.template : 'classic';
    const defaults = PDF_TEMPLATES[templateKey] || PDF_TEMPLATES.classic;

    const fontFamily = options.fontFamily || defaults.fontFamily;
    const fontSize = options.fontSize || defaults.fontSize;
    const lineHeight = options.lineHeight || defaults.lineHeight;
    const primaryColor = options.primaryColor || defaults.primaryColor;
    const textColor = options.textColor || defaults.textColor;
    const headerLayout = options.headerLayout || defaults.headerLayout;
    const padding = options.margin || defaults.margin;

    let parsedContent = marked.parse(markdownText || '', { async: false }) as string;

    let h1StyleExtra = '';
    let headerContainerExtra = '';

    if (headerLayout === 'centered') {
        h1StyleExtra = 'text-align: center;';
        headerContainerExtra = 'text-align: center;';
    } else if (headerLayout === 'split') {
        h1StyleExtra = 'display: flex; justify-content: space-between; align-items: baseline;';
    }

    const isMinimal = templateKey === 'minimal';
    const isModern = templateKey === 'modern';

    const h1BorderStyle = isMinimal 
        ? 'border-bottom: none; padding-bottom: 0;' 
        : isModern 
            ? `border-bottom: 10px solid ${primaryColor}; padding-bottom: 6px;` 
            : `border-bottom: 2px solid ${primaryColor}; padding-bottom: 6px;`;

    const h2BorderStyle = isMinimal 
        ? 'border-bottom: none; padding-bottom: 0;' 
        : isModern 
            ? `border-bottom: 10px solid ${primaryColor}; padding-bottom: 4px;` 
            : `border-bottom: 1px solid ${primaryColor}; padding-bottom: 4px;`;

    const hrStyle = isMinimal 
        ? 'display: none;' 
        : isModern 
            ? `border: none; border-top: 10px solid ${primaryColor}; margin: 16px 0;` 
            : `border: none; border-top: 1px solid ${primaryColor}; margin: 16px 0;`;

    parsedContent = parsedContent
        .replace(/<h1(\s|>)/gi, `<h1 style="font-size: 22pt; font-weight: 700; color: ${primaryColor}; margin-bottom: 8px; margin-top: 0; ${h1BorderStyle} page-break-inside: avoid; break-inside: avoid; ${h1StyleExtra}"$1`)
        .replace(/<h2(\s|>)/gi, `<h2 style="font-size: 13pt; font-weight: 700; color: ${primaryColor}; margin-top: 18px; margin-bottom: 8px; ${h2BorderStyle} text-transform: uppercase; letter-spacing: 0.05em; page-break-inside: avoid; break-inside: avoid;"$1`)
        .replace(/<hr(\s|>|\/>)/gi, `<hr style="${hrStyle}"$1`)
        .replace(/<h3(\s|>)/gi, `<h3 style="font-size: 11.5pt; font-weight: 600; color: ${primaryColor}; margin-top: 14px; margin-bottom: 4px; page-break-inside: avoid; break-inside: avoid;"$1`)
        .replace(/<h4(\s|>)/gi, `<h4 style="font-size: 10.5pt; font-weight: 600; color: ${primaryColor}; margin-top: 12px; margin-bottom: 4px; page-break-inside: avoid; break-inside: avoid;"$1`)
        .replace(/<h5(\s|>)/gi, `<h5 style="font-size: 10pt; font-weight: 600; color: ${primaryColor}; margin-top: 10px; margin-bottom: 2px; page-break-inside: avoid; break-inside: avoid;"$1`)
        .replace(/<h6(\s|>)/gi, `<h6 style="font-size: 9.5pt; font-weight: 600; color: ${primaryColor}; margin-top: 8px; margin-bottom: 2px; page-break-inside: avoid; break-inside: avoid;"$1`)
        .replace(/<p(\s|>)/gi, `<p style="margin: 6px 0; page-break-inside: avoid; break-inside: avoid; color: ${textColor};"$1`)
        .replace(/<ul(\s|>)/gi, `<ul style="margin-top: 4px; margin-bottom: 10px; padding-left: 20px; color: ${textColor};"$1`)
        .replace(/<li(\s|>)/gi, `<li style="margin-bottom: 4px; page-break-inside: avoid; break-inside: avoid; color: ${textColor};"$1`)
        .replace(/<a(\s|>)/gi, `<a style="color: ${primaryColor}; text-decoration: none;"$1`)
        .replace(/<strong(\s|>)/gi, `<strong style="font-weight: 700; color: ${textColor};"$1`)
        .replace(/<blockquote(\s|>)/gi, `<blockquote style="border-left: 3px solid ${primaryColor}; margin: 10px 0; padding-left: 12px; font-style: italic; color: #4b5563;"$1`);

    return `
        <div class="pdf-document-container" style="
            font-family: ${fontFamily}; 
            line-height: ${lineHeight}; 
            color: ${textColor}; 
            padding: ${padding} !important; 
            font-size: ${fontSize};
            background-color: #ffffff;
            box-sizing: border-box;
            width: 100%;
            ${headerContainerExtra}
        ">
            <div class="pdf-body" style="box-sizing: border-box; width: 100%;">
                ${parsedContent}
            </div>
        </div>
    `;
}
