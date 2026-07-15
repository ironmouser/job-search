export function calculateResumeSimilarity(text1?: string | null, text2?: string | null): number {
    if (!text1 || !text2) return 0; // Treat empty resumes as 0% similar (distinct)
    
    // Normalize and tokenize strings into sets of lowercase words
    const words1 = new Set(text1.toLowerCase().match(/\b\w+\b/g) || []);
    const words2 = new Set(text2.toLowerCase().match(/\b\w+\b/g) || []);
    
    if (words1.size === 0 || words2.size === 0) return 0;

    // Calculate intersection
    let intersectionSize = 0;
    for (const word of words1) {
        if (words2.has(word)) {
            intersectionSize++;
        }
    }

    // Calculate union
    const unionSize = words1.size + words2.size - intersectionSize;
    
    return unionSize === 0 ? 0 : intersectionSize / unionSize;
}
