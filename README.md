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

## Avisos de cobros de mañana

`push-reminders.js` permite activar Web Push a las 09:00 de Argentina aun con
la app cerrada. Es optativo por dispositivo y requiere una conexión Google
válida del servicio de respaldos. El Worker independiente está en
`push-worker/worker.mjs`; su configuración inicial se explica en
`configurar-avisos.html` y `push-worker/README.md`. El Worker de respaldos
existente no se reemplaza ni se modifica.

El celular sincroniza un calendario de fechas, cantidades e importes pendientes
al activar los avisos, abrir la app o modificar registros. Solo se avisa sobre
cuotas pendientes que vencen ese día. Los cambios hechos sin Internet necesitan
una sincronización posterior con la app abierta. Cuando Web Push está activo,
se omite el aviso local para evitar dos mecanismos de entrega en el mismo
celular. La llegada depende de Internet y los permisos del teléfono.

Checks: `node --test tests/financing-model.test.cjs tests/push-worker.test.mjs
tests/push-service-worker.test.cjs`. La entrega real requiere configurar el
Worker, KV y cron en Cloudflare y activar/probar desde el teléfono del usuario.

En **Movimientos → Resumen mensual · cobros y pagos** se puede consultar cualquier mes, incluidos los futuros. Se distinguen cobros de préstamos, pagos de financiación y nuevas entregas, cada uno realizado y pendiente. La diferencia compara cobros y pagos de financiación antes de nuevas entregas; no representa saldo disponible ni Dinero a futuro. Los registros realizados se agrupan por fecha real y los pendientes por vencimiento, sin duplicar movimientos vinculados ni atribuir pagos históricos sin fecha a un mes. Esta vista es de solo lectura.

**Renovar préstamo:** en el detalle de un préstamo entregado de modalidad «1 cuota», con una sola cuota y saldo pendiente, se puede sumar un importe fijo de interés acordado y trasladar el vencimiento a una fecha posterior. Conserva la misma cuota, el capital y la entrega originales, los cobros vinculados y un historial con fechas y saldos anteriores; no crea cobros ni salidas de dinero. El interés no se capitaliza automáticamente. Se pueden seguir registrando pagos parciales desde el detalle. Las renovaciones viajan en los respaldos. La edición ordinaria de un préstamo renovado queda bloqueada para evitar recalcular y borrar el acuerdo; se usa la acción de renovación para posteriores acuerdos.

El calendario de financiaciones conserva los vencimientos aun después de pagar: muestra Pendiente, Parcial o Pagada en la fecha de la obligación, con importes y fechas reales de los pagos en el detalle. Los movimientos y resúmenes financieros siguen usando las fechas reales. Los pagos mensuales anticipados se aplican al vencimiento más antiguo según el modelo existente. Si una financiación no tiene fecha válida, sus movimientos conservan la visualización anterior; no se inventan vencimientos ni fechas de pagos históricos.
