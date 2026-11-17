import {
    AlignmentType,
    BorderStyle,
    Document,
    ExternalHyperlink,
    HeadingLevel,
    Packer,
    Paragraph,
    TextRun,
} from 'docx';
import { marked, Token, Tokens } from 'marked';
import { PDF_TEMPLATES, PdfStyleOptions } from './pdfGeneratorHelper';

export type AssetFormat = 'pdf' | 'docx';

function normalizeHex(color: string | undefined, fallback: string): string {
    const clean = (color || fallback).replace('#', '').trim();
    return /^[0-9a-fA-F]{6}$/.test(clean) ? clean : fallback.replace('#', '');
}

function parseInchesToTwips(marginStr: string | undefined, fallbackInches = 0.5): number {
    const val = parseFloat(marginStr || '');
    const inches = Number.isFinite(val) && val > 0 ? val : fallbackInches;
    return Math.round(inches * 1440);
}

function parsePtToHalfPoints(sizeStr: string | undefined, fallbackPt = 11): number {
    const val = parseFloat(sizeStr || '');
    const pt = Number.isFinite(val) && val > 0 ? val : fallbackPt;
    return Math.round(pt * 2);
}

function parseLineHeightToDocx(lhStr: string | undefined, fallback = 1.5): number {
    const val = parseFloat(lhStr || '');
    const lh = Number.isFinite(val) && val > 0 ? val : fallback;
    return Math.round(lh * 240);
}

function extractPrimaryFont(fontFamily: string | undefined): string {
    if (!fontFamily) return 'Calibri';
    const first = fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    if (!first || first.startsWith('-apple-system')) return 'Calibri';
    return first;
}

type InlineChild = TextRun | ExternalHyperlink;

function buildInlineRuns(
    tokens: Token[] | undefined,
    baseOpts: {
        font: string;
        size: number;
        color: string;
        primaryColor: string;
        bold?: boolean;
        italics?: boolean;
    }
): InlineChild[] {
    if (!tokens || tokens.length === 0) return [];

    const runs: InlineChild[] = [];

    for (const token of tokens) {
        switch (token.type) {
            case 'text': {
                const t = token as Tokens.Text;
                if (t.tokens && t.tokens.length > 0) {
                    runs.push(...buildInlineRuns(t.tokens, baseOpts));
                } else {
                    runs.push(
                        new TextRun({
                            text: t.text,
                            font: baseOpts.font,
                            size: baseOpts.size,
                            color: baseOpts.color,
                            bold: baseOpts.bold,
                            italics: baseOpts.italics,
                        })
                    );
                }
                break;
            }
            case 'strong': {
                const t = token as Tokens.Strong;
                runs.push(...buildInlineRuns(t.tokens, { ...baseOpts, bold: true }));
                break;
            }
            case 'em': {
                const t = token as Tokens.Em;
                runs.push(...buildInlineRuns(t.tokens, { ...baseOpts, italics: true }));
                break;
            }
            case 'codespan': {
                const t = token as Tokens.Codespan;
                runs.push(
                    new TextRun({
                        text: t.text,
                        font: 'Courier New',
                        size: Math.max(16, baseOpts.size - 2),
                        color: baseOpts.color,
                        bold: baseOpts.bold,
                        italics: baseOpts.italics,
                    })
                );
                break;
            }
            case 'link': {
                const t = token as Tokens.Link;
                const linkRuns = buildInlineRuns(t.tokens, {
                    ...baseOpts,
                    color: baseOpts.primaryColor,
                });
                runs.push(
                    new ExternalHyperlink({
                        link: t.href,
                        children: linkRuns.length > 0
                            ? (linkRuns as TextRun[])
                            : [
                                new TextRun({
                                    text: t.text || t.href,
                                    font: baseOpts.font,
                                    size: baseOpts.size,
                                    color: baseOpts.primaryColor,
                                    underline: {},
                                }),
                            ],
                    })
                );
                break;
            }
            case 'br': {
                runs.push(new TextRun({ text: '', break: 1 }));
                break;
            }
            default: {
                const raw = (token as any).text ?? (token as any).raw ?? '';
                if (raw) {
                    runs.push(
                        new TextRun({
                            text: raw,
                            font: baseOpts.font,
                            size: baseOpts.size,
                            color: baseOpts.color,
                            bold: baseOpts.bold,
                            italics: baseOpts.italics,
                        })
                    );
                }
                break;
            }
        }
    }

    return runs;
}

export function buildDocxDocument(markdownText: string, options: PdfStyleOptions = {}): Document {
    const rawTemplate = options.template === 'techno' ? 'tech' : options.template;
    const templateKey = rawTemplate && PDF_TEMPLATES[rawTemplate] ? rawTemplate : 'classic';
    const defaults = PDF_TEMPLATES[templateKey] || PDF_TEMPLATES.classic;

    const font = extractPrimaryFont(options.fontFamily || defaults.fontFamily);
    const bodySize = parsePtToHalfPoints(options.fontSize || defaults.fontSize, 11);
    const lineSpacing = parseLineHeightToDocx(options.lineHeight || defaults.lineHeight, 1.5);
    const primaryColor = normalizeHex(options.primaryColor || defaults.primaryColor, '1e3a8a');
    const textColor = normalizeHex(options.textColor || defaults.textColor, '111827');
    const headerLayout = options.headerLayout || defaults.headerLayout;
    const marginTwips = parseInchesToTwips(options.margin || defaults.margin, 0.5);

    const isMinimal = templateKey === 'minimal';
    const isModern = templateKey === 'modern';

    const tokens = marked.lexer(markdownText || '');
    const children: Paragraph[] = [];

    const inlineDefaults = {
        font,
        size: bodySize,
        color: textColor,
        primaryColor,
    };

    const processTokens = (tokenList: Token[], listLevel?: number, ordered?: boolean) => {
        for (const token of tokenList) {
            switch (token.type) {
                case 'heading': {
                    const h = token as Tokens.Heading;
                    const depth = h.depth;
                    let headingLevel: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2;
                    let size = bodySize + 4;
                    let color = primaryColor;
                    let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] | undefined;
                    let borderBottom: { style: (typeof BorderStyle)[keyof typeof BorderStyle]; size: number; color: string; space: number } | undefined;

                    if (depth === 1) {
                        headingLevel = HeadingLevel.HEADING_1;
                        size = 44; // 22pt
                        if (headerLayout === 'centered') alignment = AlignmentType.CENTER;
                        if (!isMinimal) {
                            borderBottom = {
                                style: BorderStyle.SINGLE,
                                size: isModern ? 24 : 12,
                                color: primaryColor,
                                space: 4,
                            };
                        }
                    } else if (depth === 2) {
                        headingLevel = HeadingLevel.HEADING_2;
                        size = 26; // 13pt
                        if (!isMinimal) {
                            borderBottom = {
                                style: BorderStyle.SINGLE,
                                size: isModern ? 20 : 6,
                                color: primaryColor,
                                space: 3,
                            };
                        }
                    } else if (depth === 3) {
                        headingLevel = HeadingLevel.HEADING_3;
                        size = 23; // 11.5pt
                    } else {
                        headingLevel = HeadingLevel.HEADING_4;
                        size = bodySize;
                    }

                    const textToRender = depth === 2 ? h.text.toUpperCase() : undefined;
                    const runs = textToRender
                        ? [
                            new TextRun({
                                text: textToRender,
                                font,
                                size,
                                color,
                                bold: true,
                            }),
                        ]
                        : buildInlineRuns(h.tokens, {
                            font,
                            size,
                            color,
                            primaryColor,
                            bold: true,
                        });

                    children.push(
                        new Paragraph({
                            heading: headingLevel,
                            alignment,
                            spacing: {
                                before: depth === 1 ? 0 : depth === 2 ? 220 : 140,
                                after: depth === 1 ? 100 : 80,
                                line: lineSpacing,
                            },
                            border: borderBottom ? { bottom: borderBottom } : undefined,
                            children: runs,
                        })
                    );
                    break;
                }
                case 'paragraph': {
                    const p = token as Tokens.Paragraph;
                    const runs = buildInlineRuns(p.tokens, inlineDefaults);
                    children.push(
                        new Paragraph({
                            spacing: { before: 40, after: 80, line: lineSpacing },
                            bullet: listLevel !== undefined && !ordered ? { level: listLevel } : undefined,
                            children: runs,
                        })
                    );
                    break;
                }
                case 'list': {
                    const list = token as Tokens.List;
                    const level = listLevel !== undefined ? listLevel + 1 : 0;
                    for (let idx = 0; idx < list.items.length; idx++) {
                        const item = list.items[idx];
                        const itemRuns = buildInlineRuns(item.tokens, inlineDefaults);
                        if (itemRuns.length > 0) {
                            const prefixRuns = list.ordered
                                ? [
                                    new TextRun({
                                        text: `${idx + 1}. `,
                                        font,
                                        size: bodySize,
                                        color: textColor,
                                    }),
                                    ...itemRuns,
                                ]
                                : itemRuns;

                            children.push(
                                new Paragraph({
                                    spacing: { before: 20, after: 60, line: lineSpacing },
                                    bullet: list.ordered ? undefined : { level },
                                    indent: list.ordered ? { left: 360 * (level + 1) } : undefined,
                                    children: prefixRuns,
                                })
                            );
                        }
                    }
                    break;
                }
                case 'blockquote': {
                    const bq = token as Tokens.Blockquote;
                    const runs = buildInlineRuns(bq.tokens, {
                        ...inlineDefaults,
                        color: '4b5563',
                        italics: true,
                    });
                    children.push(
                        new Paragraph({
                            spacing: { before: 80, after: 80, line: lineSpacing },
                            indent: { left: 360 },
                            border: {
                                left: {
                                    style: BorderStyle.SINGLE,
                                    size: 18,
                                    color: primaryColor,
                                    space: 8,
                                },
                            },
                            children: runs,
                        })
                    );
                    break;
                }
                case 'hr': {
                    if (!isMinimal) {
                        children.push(
                            new Paragraph({
                                spacing: { before: 120, after: 120 },
                                border: {
                                    bottom: {
                                        style: BorderStyle.SINGLE,
                                        size: isModern ? 20 : 6,
                                        color: primaryColor,
                                        space: 1,
                                    },
                                },
                                children: [],
                            })
                        );
                    }
                    break;
                }
                case 'code': {
                    const c = token as Tokens.Code;
                    const lines = c.text.split('\n');
                    for (const line of lines) {
                        children.push(
                            new Paragraph({
                                spacing: { before: 20, after: 20, line: lineSpacing },
                                children: [
                                    new TextRun({
                                        text: line,
                                        font: 'Courier New',
                                        size: Math.max(16, bodySize - 2),
                                        color: textColor,
                                    }),
                                ],
                            })
                        );
                    }
                    break;
                }
                case 'text': {
                    const t = token as Tokens.Text;
                    const runs = t.tokens
                        ? buildInlineRuns(t.tokens, inlineDefaults)
                        : [
                            new TextRun({
                                text: t.text,
                                font,
                                size: bodySize,
                                color: textColor,
                            }),
                        ];
                    children.push(
                        new Paragraph({
                            spacing: { before: 40, after: 80, line: lineSpacing },
                            children: runs,
                        })
                    );
                    break;
                }
                case 'space':
                    break;
                default: {
                    const raw = (token as any).text ?? (token as any).raw ?? '';
                    if (raw && raw.trim()) {
                        children.push(
                            new Paragraph({
                                spacing: { before: 40, after: 80, line: lineSpacing },
                                children: [
                                    new TextRun({
                                        text: raw.trim(),
                                        font,
                                        size: bodySize,
                                        color: textColor,
                                    }),
                                ],
                            })
                        );
                    }
                    break;
                }
            }
        }
    };

    processTokens(tokens);

    if (children.length === 0) {
        children.push(
            new Paragraph({
                children: [
                    new TextRun({
                        text: markdownText || '',
                        font,
                        size: bodySize,
                        color: textColor,
                    }),
                ],
            })
        );
    }

    return new Document({
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: marginTwips,
                            right: marginTwips,
                            bottom: marginTwips,
                            left: marginTwips,
                        },
                    },
                },
                children,
            },
        ],
    });
}

export async function generateDocxBlob(markdownText: string, options: PdfStyleOptions = {}): Promise<Blob> {
    const doc = buildDocxDocument(markdownText, options);
    return Packer.toBlob(doc);
}

export async function generateDocxBuffer(markdownText: string, options: PdfStyleOptions = {}): Promise<Buffer> {
    const doc = buildDocxDocument(markdownText, options);
    return Packer.toBuffer(doc);
}
