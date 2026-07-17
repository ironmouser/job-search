async function main() {
    const res = await fetch('http://localhost:4000/api/scrape', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            // Need to mock session cookies or auth if it checks getServerSession!
        },
        body: JSON.stringify({ keyword: 'software', location: 'remote' })
    });
    console.log(res.status);
    console.log(await res.text());
}
main();
