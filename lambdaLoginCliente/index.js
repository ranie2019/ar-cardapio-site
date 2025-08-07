// Constantes de configuração
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
};

exports.handler = async (event) => {
    try {
        // Log do evento recebido para debugging
        console.log('Event received:', JSON.stringify(event, null, 2));

        // Verifica se o método HTTP é POST
        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    success: false,
                    message: 'Método não permitido. Use POST.'
                })
            };
        }

        // Verifica se o header Content-Type está presente e é application/json
        const contentType = event.headers?.['Content-Type'] || event.headers?.['content-type'];
        if (!contentType || !contentType.includes('application/json')) {
            return {
                statusCode: 415,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    success: false,
                    message: 'Content-Type deve ser application/json'
                })
            };
        }

        // Parse do corpo da requisição
        let requestBody;
        try {
            requestBody = JSON.parse(event.body);
        } catch (parseError) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    success: false,
                    message: 'Corpo da requisição inválido. JSON malformado.'
                })
            };
        }

        // Validação dos campos obrigatórios
        if (!requestBody.email || !requestBody.senha) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    success: false,
                    message: 'Email e senha são obrigatórios'
                })
            };
        }

        // Aqui você adicionaria sua lógica de negócios
        // Exemplo: autenticação do usuário
        const { email, senha } = requestBody;
        console.log(`Tentativa de login com email: ${email}`);

        // Simulação de autenticação bem-sucedida
        const authenticated = senha === '1234'; // Substitua por sua lógica real

        if (authenticated) {
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    ...CORS_HEADERS
                },
                body: JSON.stringify({
                    success: true,
                    message: 'Login bem-sucedido',
                    user: {
                        email: email,
                        token: 'simulated-jwt-token' // Em produção, gere um token real
                    }
                })
            };
        } else {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    ...CORS_HEADERS
                },
                body: JSON.stringify({
                    success: false,
                    message: 'Credenciais inválidas'
                })
            };
        }

    } catch (error) {
        console.error('Erro interno:', error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                success: false,
                message: 'Erro interno do servidor',
                errorDetails: process.env.NODE_ENV === 'development' ? error.message : undefined
            })
        };
    }
};