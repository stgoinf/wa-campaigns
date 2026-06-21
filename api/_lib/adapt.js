// Adaptador handler Vercel → Express.
//
// Los 12 handlers en api/**.js usan la firma estándar Vercel:
//   module.exports = async function handler(req, res) { ... }
//
// Esa firma es compatible con Express, EXCEPTO por una cosa:
// Vercel hace coerción de las dynamic routes (`[id].js`) a `req.query.id`,
// mientras que Express las pone en `req.params.id`. Este helper mergea
// `req.params` en `req.query` antes de invocar el handler para que el
// código existente funcione sin cambios.
//
// Uso:
//   app.all('/api/admin', adapt(require('./api/admin')));
//   app.all('/api/campaigns/:id', adapt(require('./api/campaigns/[id]'), { id: 'id' }));

function adapt(handler, paramMap = null) {
    return async (req, res, next) => {
        try {
            if (paramMap) {
                for (const [from, to] of Object.entries(paramMap)) {
                    req.query[to] = req.params[from];
                }
            }
            await handler(req, res);
        } catch (err) {
            next(err);
        }
    };
}

module.exports = { adapt };
