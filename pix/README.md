# Checkout PIX Duttyfy — sem formulário

O checkout mostra R$ 67,90 fixos e tenta gerar o PIX automaticamente ao abrir a página. A URL secreta da Duttyfy permanece no backend.

## Instalação

1. Instale Node.js 18+.
2. Execute `npm install`.
3. Copie `.env.example` para `.env`.
4. Configure `DUTTYFY_PIX_URL_ENCRYPTED` com a URL completa do painel Duttyfy.
5. Configure os campos `PIX_CUSTOMER_NAME`, `PIX_CUSTOMER_DOCUMENT`, `PIX_CUSTOMER_EMAIL` e `PIX_CUSTOMER_PHONE` no `.env` para um teste controlado, ou adapte o backend para buscar os dados de um pedido/sessão autenticada.
6. Execute `npm start` e abra `http://localhost:3000`.

## Importante sobre o pagador

A API exige nome, CPF/CNPJ, e-mail e telefone. Para manter a página sem formulário, o exemplo lê esses dados do ambiente do servidor. Isso é adequado apenas para teste controlado com dados autorizados. **Não use um único conjunto de dados de cliente para todos os compradores.** Em uma loja real, carregue os dados a partir de um pedido e sessão autenticados no backend.

O preço é fixado no servidor em 6790 centavos (R$ 67,90), não sendo aceito do navegador. O frontend envia a query string completa como `utm`. O backend persiste `transactionId`, gera status por consulta a cada 5 segundos e encerra a espera após 15 minutos.

Use HTTPS em produção, mantenha `.env` fora do repositório e siga a documentação MCP completa da Duttyfy antes de lançar.
