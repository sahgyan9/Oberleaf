const assert = require('assert');

(async () => {
  console.log('1. Testing /api/projects...');
  const pRes = await fetch('http://127.0.0.1:3001/api/projects');
  assert.strictEqual(pRes.status, 200);
  const projects = await pRes.json();
  console.log('Projects count:', projects.length, projects.map(p => p.id));
  assert(projects.length >= 1);

  console.log('2. Testing /api/projects/sample-project/files...');
  const fRes = await fetch('http://127.0.0.1:3001/api/projects/sample-project/files');
  assert.strictEqual(fRes.status, 200);
  const files = await fRes.json();
  console.log('Sample project files:', files.map(f => f.name));
  const figuresDir = files.find(f => f.name === 'figures');
  assert(figuresDir && figuresDir.children.length > 0);
  console.log('Figures children relativePaths:', figuresDir.children.map(c => c.relativePath));

  console.log('3. Testing /api/projects/sample-project/preview-image...');
  const imgPath = figuresDir.children[0].relativePath;
  const imgRes = await fetch('http://127.0.0.1:3001/api/projects/sample-project/preview-image?path=' + encodeURIComponent(imgPath));
  assert.strictEqual(imgRes.status, 200);
  assert.strictEqual(imgRes.headers.get('content-type'), 'image/png');
  const imgBuf = await imgRes.arrayBuffer();
  console.log('Fetched image bytes:', imgBuf.byteLength);

  console.log('4. Testing batch upload...');
  const dummyBase64 = Buffer.from('test-image-content').toString('base64');
  const batchRes = await fetch('http://127.0.0.1:3001/api/projects/sample-project/upload-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [
        { fileName: 'test_a.png', base64Data: dummyBase64 },
        { fileName: 'test_b.jpg', base64Data: dummyBase64 }
      ]
    })
  });
  assert.strictEqual(batchRes.status, 200);
  const batchData = await batchRes.json();
  console.log('Batch results:', batchData.results.map(r => ({ name: r.fileName, path: r.relativePath, success: r.success })));
  assert.strictEqual(batchData.results.length, 2);
  assert(batchData.results.every(r => r.success));

  console.log('5. Testing duplicate upload naming protection...');
  const dupRes = await fetch('http://127.0.0.1:3001/api/projects/sample-project/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: 'test_a.png',
      base64Data: dummyBase64
    })
  });
  const dupData = await dupRes.json();
  console.log('Duplicate upload resolved to:', dupData.fileName, dupData.relativePath);
  assert(dupData.fileName !== 'test_a.png'); // Renamed to test_a_1.png

  console.log('6. Testing file text safety guard (binary file protection)...');
  const guardRes = await fetch('http://127.0.0.1:3001/api/projects/sample-project/file?path=figures/test_a.png', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'malicious latex overwrite' })
  });
  assert.strictEqual(guardRes.status, 400);
  console.log('Binary protection verified: status 400 received');

  console.log('7. Testing LaTeX Figure Compilation End-to-End...');
  // Write a main.tex that includes the figure
  const figRel = figuresDir.children[0].relativePath;
  const texContent = `\\documentclass{article}
\\usepackage{graphicx}
\\title{Figure Pipeline Verification}
\\author{Overleaf Copy Test}
\\date{\\today}
\\begin{document}
\\maketitle
\\begin{figure}[htbp]
  \\centering
  \\includegraphics[width=0.8\\textwidth]{${figRel}}
  \\caption{Sample experiment figure}
  \\label{fig:experiment}
\\end{figure}
Figure \\ref{fig:experiment} shows the thin film experimental result.
\\end{document}`;

  await fetch('http://127.0.0.1:3001/api/projects/sample-project/file?path=main.tex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: texContent })
  });

  const compileRes = await fetch('http://127.0.0.1:3001/api/projects/sample-project/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mainFile: 'main.tex', engine: 'pdflatex' })
  });
  assert.strictEqual(compileRes.status, 200);
  const compileData = await compileRes.json();
  console.log('Compile success?', compileData.success, 'Duration:', compileData.durationMs, 'pdfUrl:', compileData.pdfUrl);
  assert.strictEqual(compileData.success, true);
  assert(compileData.pdfUrl);

  console.log('8. Testing PDF Serving...');
  const pdfRes = await fetch('http://127.0.0.1:3001' + compileData.pdfUrl);
  assert.strictEqual(pdfRes.status, 200);
  assert.strictEqual(pdfRes.headers.get('content-type'), 'application/pdf');
  const pdfBytes = await pdfRes.arrayBuffer();
  console.log('PDF delivered successfully! Size:', pdfBytes.byteLength, 'bytes');

  console.log('9. Testing Figure Not Found Diagnostic...');
  await fetch('http://127.0.0.1:3001/api/projects/sample-project/file?path=main.tex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `\\documentclass{article}
\\usepackage{graphicx}
\\begin{document}
\\includegraphics{figures/does_not_exist_image.png}
\\end{document}`
    })
  });
  const failRes = await fetch('http://127.0.0.1:3001/api/projects/sample-project/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mainFile: 'main.tex', engine: 'pdflatex' })
  });
  const failData = await failRes.json();
  console.log('Expected fail success?', failData.success, 'Errors:', failData.errors.length);
  assert.strictEqual(failData.success, false);
  const figErr = failData.errors.find(e => e.friendlyExplanation && e.friendlyExplanation.includes('Figure could not be found'));
  console.log('Friendly diagnostic:', figErr ? figErr.friendlyExplanation : 'none');
  assert(figErr);

  // Clean up test files
  await fetch('http://127.0.0.1:3001/api/projects/sample-project/file?path=figures/test_a.png', { method: 'DELETE' });
  await fetch('http://127.0.0.1:3001/api/projects/sample-project/file?path=figures/test_a_1.png', { method: 'DELETE' });
  await fetch('http://127.0.0.1:3001/api/projects/sample-project/file?path=figures/test_b.jpg', { method: 'DELETE' });

  // Restore main.tex to clean state
  await fetch('http://127.0.0.1:3001/api/projects/sample-project/file?path=main.tex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: texContent })
  });
  await fetch('http://127.0.0.1:3001/api/projects/sample-project/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mainFile: 'main.tex', engine: 'pdflatex' })
  });

  console.log('\n=============================================');
  console.log('✅ ALL 9 INTEGRATION TESTS PASSED PERFECTLY!');
  console.log('=============================================\n');
})();
