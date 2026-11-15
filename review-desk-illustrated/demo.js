'use strict';

// The fixtures describe a fictional palette tool. Review anchors address the bundled originals.
window.demoProject = () => ({
  id: 'palette-demo', name: 'Palette tool · Release review', revision: 0,
  criteria: [
    { id: 'colors', title: 'Show the palette and HEX values on the home page', detail: 'The home page displays five hexadecimal color values.', status: 'pending', note: '', evidence: [
      {id: 'palette-home', kind: 'image', name: 'home-page.png', path: 'assets/palette.png', x: 50, y: 76, caption: 'The orange swatch is labeled #F29D55, with the other values alongside.'}
    ]},
    { id: 'copy', title: 'Show confirmation after copying a color', detail: 'After clicking a swatch, the interface shows the value copied.', status: 'pending', note: '', evidence: [
      {id: 'palette-clip', kind: 'video', name: 'copy-demo.webm', path: 'assets/copy.webm', time: 1.5, caption: 'Check the message after the third swatch is clicked.'}
    ]},
    { id: 'guide', title: 'Document the keyboard controls', detail: 'Explain how to move between swatches and copy a value.', status: 'pass', note: 'Paragraph 2 lists Tab and Enter.', evidence: [
      {id: 'palette-guide', kind: 'text', name: 'guide.md', text: 'Palette guide\n\nPress Tab to move to the next swatch, then Enter to copy its HEX value.\n\nYou can also click a swatch. A confirmation appears above the palette after copying.', paragraph: 2, caption: 'Keyboard controls'}
    ]}
  ]
});
