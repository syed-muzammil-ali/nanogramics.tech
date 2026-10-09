/* Lightweight Code 39 barcode labels. SKUs use only supported uppercase characters. */
(function () {
  const patterns = {
    '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw',
    '5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
    'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn',
    'F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
    'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn',
    'P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
    'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn',
    'Z':'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn',
    '/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn'
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));

  function normalize(value) {
    const text = String(value || '').trim().toUpperCase();
    if (!text || [...text].some(char => !patterns[char] || char === '*')) {
      throw new Error('Barcode supports A-Z, 0-9, spaces and - . $ / + %.');
    }
    return text;
  }

  function svg(value, options = {}) {
    const text = normalize(value);
    const narrow = Number(options.narrow || 2);
    const wide = narrow * 3;
    const height = Number(options.height || 72);
    const quiet = narrow * 10;
    const encoded = `*${text}*`;
    let x = quiet;
    const bars = [];
    for (const character of encoded) {
      [...patterns[character]].forEach((widthCode, index) => {
        const width = widthCode === 'w' ? wide : narrow;
        if (index % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${width}" height="${height}"/>`);
        x += width;
      });
      x += narrow;
    }
    const totalWidth = x + quiet - narrow;
    return `<svg class="barcode-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height + 24}" role="img" aria-label="Barcode ${escapeHtml(text)}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars.join('')}</g><text x="${totalWidth / 2}" y="${height + 18}" text-anchor="middle" font-family="monospace" font-size="14" fill="#000">${escapeHtml(text)}</text></svg>`;
  }

  let currentProduct = null;

  function show(product) {
    currentProduct = product;
    const dialog = document.getElementById('barcode-dialog');
    if (!dialog) return;
    document.getElementById('barcode-product-name').textContent = product.name || 'Product';
    document.getElementById('barcode-product-meta').textContent = [product.brand, `Rs ${Number(product.price || 0).toLocaleString()}`].filter(Boolean).join(' · ');
    document.getElementById('barcode-preview').innerHTML = svg(product.barcode || product.code);
    if (!dialog.open) dialog.showModal();
  }

  function print() {
    if (!currentProduct) return;
    const label = svg(currentProduct.barcode || currentProduct.code, {narrow: 3, height: 90});
    const printWindow = window.open('', '_blank', 'width=520,height=420');
    if (!printWindow) throw new Error('Allow pop-ups to print barcode labels.');
    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(currentProduct.code)}</title><style>@page{size:60mm 35mm;margin:2mm}body{font-family:Arial,sans-serif;margin:0;text-align:center;color:#000}.label{width:56mm;height:31mm;display:flex;flex-direction:column;justify-content:center}.name{font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.barcode-svg{width:54mm;height:22mm}</style></head><body><div class="label"><div class="name">${escapeHtml(currentProduct.name)}</div>${label}</div><script>onload=()=>{print();setTimeout(()=>close(),250)}<\/script></body></html>`);
    printWindow.document.close();
  }

  window.BarcodeTools = {normalize, svg, show, print};
})();
