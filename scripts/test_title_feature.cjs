const assert = require('assert');

(async () => {
  console.log('=== 1. Testing Title Extraction Logic in src/utils/latexTitle and server/latexTitle ===');
  
  // Test both server and client modules
  const serverModule = await import('../server/latexTitle.js');
  const clientModule = await import('../src/utils/latexTitle.js');

  const testCases = [
    {
      input: '\\title{\\textbf{Scholarly Atelier: Local \\LaTeX{} Workspace}}',
      expected: 'Scholarly Atelier - Local LaTeX Workspace'
    },
    {
      input: '\\title{Atomically Thin $\\text{MoS}_2$: Electronic Properties and Exciton Dynamics}',
      expected: 'Atomically Thin MoS_2 - Electronic Properties and Exciton Dynamics'
    },
    {
      input: '\\title{Conference Paper Title*\\\\}',
      expected: 'Conference Paper Title'
    },
    {
      input: '\\title{Conference Paper\\thanks{Supported by NSF}}',
      expected: 'Conference Paper'
    },
    {
      input: '\\title[Short]{Quantum Computing For Everyone: Foundational Principles}',
      expected: 'Quantum Computing For Everyone - Foundational Principles'
    },
    {
      input: '\\title{\\huge \\bfseries A Study on \\emph{Machine Learning}}',
      expected: 'A Study on Machine Learning'
    },
    {
      input: '\\title{Colloidal CdSe and Graphene Quantum Dots: Optical Confinement}',
      expected: 'Colloidal CdSe and Graphene Quantum Dots - Optical Confinement'
    },
    {
      input: '\\title{\n  Multi-line Title\n  With Subtitle\n}',
      expected: 'Multi-line Title With Subtitle'
    },
    {
      input: '\\documentclass{article}\n% \\title{Ignored In Comment}\n\\title{Actual Title}\n\\begin{document}',
      expected: 'Actual Title'
    },
    {
      input: '\\title{}',
      expected: null
    },
    {
      input: 'No title command here',
      expected: null
    }
  ];

  for (const tc of testCases) {
    const serverResult = serverModule.extractLatexTitle(tc.input);
    const clientResult = clientModule.extractLatexTitle(tc.input);
    assert.strictEqual(serverResult, tc.expected, `Server failed for "${tc.input}": got "${serverResult}", expected "${tc.expected}"`);
    assert.strictEqual(clientResult, tc.expected, `Client failed for "${tc.input}": got "${clientResult}", expected "${tc.expected}"`);
    console.log(`✓ Passed: "${tc.input.split('\n')[0].slice(0, 40)}..." -> "${serverResult}"`);
  }

  // Fallback tests
  assert.strictEqual(clientModule.getLatexPdfFilename('\\title{Great Paper}', 'fallback'), 'Great Paper.pdf');
  assert.strictEqual(clientModule.getLatexPdfFilename('', 'My_Project'), 'My_Project.pdf');
  assert.strictEqual(clientModule.getLatexPdfFilename('\\title{}', 'Project: Alpha'), 'Project - Alpha.pdf');
  console.log('✓ Passed fallback tests');

  console.log('\n=== 2. Testing Server Download Endpoint ===');
  const res1 = await fetch('http://127.0.0.1:3001/api/projects/MoS2_Thin_Film/download-pdf');
  assert.strictEqual(res1.status, 200);
  const disp1 = res1.headers.get('content-disposition');
  console.log('MoS2_Thin_Film Content-Disposition:', disp1);
  assert(disp1.includes('MoS2 Thin Film.pdf'));

  const res2 = await fetch('http://127.0.0.1:3001/api/projects/Quantum_Computing_For_Everyone/download-pdf');
  assert.strictEqual(res2.status, 200);
  const disp2 = res2.headers.get('content-disposition');
  console.log('Quantum_Computing_For_Everyone Content-Disposition:', disp2);
  assert(disp2.includes('Quantum Computing For Everyone - Foundational Principles.pdf'));

  console.log('\n=== 3. Testing Compile Endpoint Title Extraction ===');
  const compRes = await fetch('http://127.0.0.1:3001/api/projects/MoS2_Thin_Film/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mainFile: 'main.tex' })
  });
  assert.strictEqual(compRes.status, 200);
  const compData = await compRes.json();
  console.log('Compiled documentTitle:', compData.documentTitle);
  console.log('Compiled pdfDownloadFilename:', compData.pdfDownloadFilename);
  assert.strictEqual(compData.documentTitle, 'MoS2 Thin Film');
  assert.strictEqual(compData.pdfDownloadFilename, 'MoS2 Thin Film.pdf');

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
})().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
