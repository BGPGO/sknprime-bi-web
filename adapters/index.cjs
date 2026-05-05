/**
 * Registry de adapters disponíveis.
 * Adicionar adapter novo: importar aqui + atualizar adapters/_CONTRACT.md.
 */
'use strict';

module.exports = {
  'omie': require('./omie.cjs'),
  'omie-multi': require('./omie-multi.cjs'),
  'conta-azul': require('./conta-azul.cjs'),
  'manual-xlsx': require('./manual-xlsx.cjs'),
  // 'bling': require('./bling.cjs'),         // TODO
  // 'tiny': require('./tiny.cjs'),           // TODO
  // 'f360': require('./f360.cjs'),           // TODO
  // 'ssw': require('./ssw.cjs'),             // TODO
};
