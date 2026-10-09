# Control de préstamos

## Financiación recibida con interés mensual y capital final

En **Financiación → Nueva**, elegí **Interés mensual + capital final (recibida)**.
Ingresá la persona que te presta, el capital, la tasa mensual, la cantidad de meses,
la fecha de recepción y el primer vencimiento. La tasa se aplica al capital inicial
cada mes. El último pago incluye ese interés y la devolución de todo el capital.

Ejemplo: $5.000.000 al 10% durante seis meses produce cinco pagos de $500.000
y uno de $5.500.000; el total a devolver es $8.000.000.

La recepción suma dinero una sola vez. Cada pago reduce el saldo disponible y la
deuda. El dinero a futuro descuenta la deuda completa pendiente; la proyección y
el calendario distribuyen las obligaciones en sus vencimientos mensuales.
Los pagos parciales y anticipados se aplican primero al vencimiento más antiguo.
Desde el detalle se pueden editar la financiación y sus pagos, o eliminarlos.
Al cambiar condiciones con pagos existentes se pide confirmar el recálculo.

Las financiaciones anteriores de cargos únicos conservan su comportamiento.
La modalidad nueva usa campos opcionales en `cardFinancings`, por lo que los
respaldos completos incluyen las condiciones y pagos sin una colección adicional.
Marcarla como histórica registra la deuda sin sumar otra vez el capital recibido.

El préstamo que otorgás a tu cliente se registra por separado en Préstamos.
La app no vincula automáticamente ambos contratos ni registra pagos por sí sola.

Validación del cálculo: `node --test tests/financing-model.test.cjs`.

El primer vencimiento de una financiación nueva se propone un mes después de
la recepción, respetando el último día de los meses cortos. Se actualiza al
cambiar la fecha de recepción mientras no se haya elegido un vencimiento manual.
Al editar una financiación existente se conserva el vencimiento guardado.
Desde el detalle de un movimiento de recepción o pago se puede abrir la
financiación asociada con el botón Ver financiación.
