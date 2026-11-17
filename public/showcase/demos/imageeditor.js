/* Demos da vitrine: imageeditor (grupo Dados). Nenhuma imagem externa: as fotos de exemplo são desenhadas aqui, por canvas. */
(function () {
  const D = window.R4Demos = window.R4Demos || {};
  const add = (k, ...items) => (D[k] ||= []).push(...items);

  /** Desenha uma "foto" de teste (gradiente, sol, montanhas e texto) e devolve um File PNG. */
  // (global de propósito: o código dos exemplos é reavaliado pela vitrine e só enxerga o que está em window)
  window.fotoDeTeste = function fotoDeTeste(w, h, nome) {
    if (typeof createImageBitmap !== 'function') return Promise.resolve(null);   // sem canvas (ex.: jsdom)
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#ff9a8b'); g.addColorStop(0.5, '#ffd86f'); g.addColorStop(1, '#4facfe');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffe66d'; x.beginPath(); x.arc(w * 0.75, h * 0.28, h * 0.14, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#2d3a6b'; x.beginPath(); x.moveTo(0, h); x.lineTo(w * 0.25, h * 0.45); x.lineTo(w * 0.5, h); x.fill();
    x.fillStyle = '#1b2447'; x.beginPath(); x.moveTo(w * 0.3, h); x.lineTo(w * 0.62, h * 0.55); x.lineTo(w, h); x.fill();
    x.fillStyle = '#fff'; x.font = 'bold ' + Math.round(h * 0.12) + 'px sans-serif'; x.textAlign = 'center';
    x.fillText('libr4 · ' + w + '×' + h, w / 2, h * 0.14);
    return new Promise(ok => c.toBlob(b => ok(new File([b], nome || 'paisagem.png', { type: 'image/png' })), 'image/png'));
  };

  add('imageeditor',
    { title: 'JS: editor com imagem gerada por canvas + Aplicar', async fn(el, out) {
      const foto = await fotoDeTeste(1200, 800, 'paisagem.png');   // File PNG desenhado por canvas (nada externo)
      if (!foto) return out('Este navegador não tem canvas/ImageBitmap.');
      const ed = R4.imageeditor(el, foto, { aspect: 1, shape: 'circle', fineRotate: true, maxWidth: 600 });
      const barra = R4.util.el('div', { style: { marginTop: '10px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } });
      const resultado = R4.util.el('img', { alt: 'Resultado do recorte', style: { maxWidth: '120px', border: '1px solid var(--r4-line)', borderRadius: '6px' } });
      let url = '';
      const aplicar = R4.util.el('button', { type: 'button', class: 'r4-btn r4-btn-primary', text: 'Aplicar recorte' });
      aplicar.addEventListener('click', async () => {
        try {
          const f = await ed.getFile('avatar.png', { format: 'png' });   // re-codificado: sem EXIF/GPS
          if (url) URL.revokeObjectURL(url);
          resultado.src = url = URL.createObjectURL(f);
          out({ nome: f.name, tipo: f.type, bytes: f.size });
        } catch (e) { out('Erro: ' + e.message); }
      });
      barra.append(aplicar, resultado);
      el.append(barra);
      ed.on('ready', () => out('Imagem pronta. Arraste, use a roda do mouse, + / − , [ ] e as setas.'));
      ed.on('change', (c, s) => out({ zoom: +s.zoom.toFixed(2), giro: s.rot * 90 + s.fine, espelhado: s.flip }));
      ed.on('error', (c, msg) => out('Erro: ' + msg));
    } },
    { title: 'HTML: <r4-imageeditor> (escolha uma imagem do seu computador)', html: `
<r4-imageeditor aspect="4/3" fine-rotate max-width="1200" format="webp"></r4-imageeditor>` },
    { title: 'JS: proporções (livre, 1:1, 4:3, 16:9) com setAspect', async fn(el, out) {
      const foto = await fotoDeTeste(1600, 900, 'larga.png');
      if (!foto) return out('Este navegador não tem canvas/ImageBitmap.');
      const ed = R4.imageeditor(el, foto, { aspect: 16 / 9, height: 300 });
      const barra = R4.util.el('div', { style: { marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' } });
      [['Livre', 0], ['1:1', 1], ['4:3', 4 / 3], ['16:9', 16 / 9], ['3:4', 3 / 4]].forEach(([t, a]) => {
        const b = R4.util.el('button', { type: 'button', class: 'r4-btn', text: t });
        b.addEventListener('click', () => { ed.setAspect(a); out('Proporção: ' + t); });
        barra.append(b);
      });
      el.append(barra);
    } },
    { title: 'JS: R4.imageeditor.open(...) numa janela modal (File sintético)', async fn(el, out) {
      const b = R4.util.el('button', { type: 'button', class: 'r4-btn r4-btn-primary', text: 'Editar foto de exemplo' });
      const img = R4.util.el('img', { alt: 'Foto editada', style: { display: 'block', marginTop: '10px', maxWidth: '240px', borderRadius: '6px' }, hidden: true });
      let url = '';
      b.addEventListener('click', async () => {
        try {
          const foto = await fotoDeTeste(2000, 1333, 'foto-grande.png');
          if (!foto) return out('Este navegador não tem canvas/ImageBitmap.');
          const editado = await R4.imageeditor.open(foto, { aspect: 3 / 4, maxWidth: 800 });   // File | null (cancelou)
          if (!editado) return out('Cancelado.');
          if (url) URL.revokeObjectURL(url);
          img.src = url = URL.createObjectURL(editado); img.hidden = false;
          out({ nome: editado.name, tipo: editado.type, bytes: editado.size });
        } catch (e) { out('Recusado: ' + e.message); }
      });
      const svg = R4.util.el('button', { type: 'button', class: 'r4-btn', text: 'Tentar abrir um SVG (recusado)', style: { marginLeft: '8px' } });
      svg.addEventListener('click', async () => {
        try { await R4.imageeditor.open(new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'x.svg', { type: 'image/svg+xml' })); }
        catch (e) { out('Recusado: ' + e.message); }
      });
      el.append(b, svg, img);
    } },
    { title: 'HTML: <r4-filedrop edit="image"> (corta antes de entrar na lista)', html: `
<r4-filedrop edit="image" accept="image/*" aspect="1" shape="circle" max-width="512" hint="Escolha uma foto: o editor abre antes de enviar"></r4-filedrop>` },
    { title: 'JS: filedrop com edit e upload do arquivo já editado', fn(el, out) {
      const fd = R4.filedrop(el, { accept: 'image/png,image/jpeg,image/webp', edit: 'image', editOptions: { aspect: 4 / 3, maxWidth: 800, format: 'jpeg', quality: 0.8 } });
      fd.on('files', (c, arquivos) => out(arquivos.map(f => ({ nome: f.name, tipo: f.type, bytes: f.size }))));
      fd.on('invalid', (c, erros) => out(erros.join('\n')));
      // fd.upload('/vitrine/api/upload')  // envia o arquivo EDITADO (o original nunca sai do navegador)
    } }
  );
})();
