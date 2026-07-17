async function testRPOC() {
    const params = new URLSearchParams();
    params.append('search_keywords', 'software engineer');
    params.append('per_page', '50');
    params.append('orderby', 'featured');
    params.append('order', 'DESC');
    
    const response = await fetch('https://remotepoc.com/jm-ajax/get_listings/', {
        method: 'POST',
        body: params
    });

    const body = await response.json();
    console.log("HTML length:", body?.html?.length);
    console.log("Found: ", body?.found);
}
testRPOC();
