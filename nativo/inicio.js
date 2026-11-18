import('/pagina.js').catch(error => {
  console.error(error)
  document.getElementById('startup').hidden = true
  const message = document.getElementById('error')
  message.textContent = 'Não foi possível carregar os arquivos do Battalion. Reabra o executável atualizado e use o endereço que ele abrir.'
  message.hidden = false
})
