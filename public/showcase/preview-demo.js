/* Página de prévia da vitrine: diz ao R4.preview o que cada chave do painel pode mudar (allowlist). */
R4.preview.listen({
  text: { titulo: '#titulo', bio: '#bio', botao: '#cta', horarios: '#horarios' },
  var: { cor: '--cor', corTexto: '--cor-texto', raio: { name: '--raio', unit: 'px' } },
  class: {
    estilo: { target: 'body', values: { solido: 'topo-solido', gradiente: 'topo-gradiente', contorno: 'topo-contorno' } },
    layout: { target: 'body', values: { grade: 'galeria-grade', lista: 'galeria-lista', carrossel: 'galeria-carrossel' } }
  },
  show: { mostrarBio: '#bio', mostrarHorarios: '#bloco-horarios' }
});
