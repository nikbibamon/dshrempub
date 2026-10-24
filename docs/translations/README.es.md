# Tvijo DSHREM — de una tarea a un resultado verificado

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo reúne un espacio de trabajo en el navegador, una extensión de VS Code y herramientas de terminal en torno a un flujo de desarrollo compartido. Describe la tarea, elige su host de ejecución y sus permisos, inspecciona los cambios y conserva la evidencia usada para aceptar el resultado. Esta guía presenta el producto; el README técnico del repositorio y la referencia de comandos siguen siendo la autoridad para la CLI.

## Empieza con tu espacio de trabajo preferido

Abre [DSHREM](https://dsh.tvijo.com/), obtén la [extensión de VS Code e instrucciones de terminal](https://dsh.tvijo.com/download), o lee [configuración explicada](https://dsh.tvijo.com/knowledge/settings-explained). Inicia sesión mediante el flujo de cuenta compatible con el servicio. Nunca pegues claves de API de proveedores en un prompt compartido, un issue público o un repositorio.

La CLI de Node.js requiere Node 22 o superior. Desde una copia local del repositorio:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

El comando también está disponible como `dshrem`. Esta CLI de chat remoto muestra las herramientas sugeridas sin ejecutarlas. La edición local y la ejecución de comandos pertenecen al Agente de VS Code o a un entorno de ejecución de host configurado explícitamente; tienen permisos separados. Consulta [ayuda de la CLI](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Entiende las opciones

**Evidencia primero** separa los hechos respaldados de las suposiciones. **Planificar y comprobar** solicita un plan breve y contrasta el resultado con la petición. **Revisar la respuesta** cuestiona un borrador; es autorrevisión salvo que se asigne explícitamente un revisor separado. Ninguno de estos métodos garantiza la corrección ni un menor uso de tokens.

Los presets de tareas añaden instrucciones y listas de verificación reutilizables. No crean memoria adicional del modelo. Una colección de contexto más grande sigue teniendo que ajustarse a los límites de solicitud del servicio y del modelo. Las rutas avanzadas de controlador, Python y estado se refieren al host de la extensión seleccionado; en Remote SSH, ese es el servidor remoto.

## Trabaja en equipo cuando ayude

Un equipo AGENTROY asigna al coordinador, a los implementadores y a los revisores responsabilidades distintas. Las políticas del host pueden solicitar DSHREM ds41f y herramientas Codex o Claude basadas en cuenta, con revisión arquitectónica opcional. La disponibilidad depende del entorno instalado, del acceso a la cuenta y de la política elegida. Una suscripción ausente no debe convertirse silenciosamente en una llamada de API de pago.

Tres a seis roles son decisiones de organización, no una fórmula de calidad. Los revisores necesitan la versión exacta del artefacto y la evidencia de las pruebas. Una comprobación fallida grave bloquea la aceptación incluso cuando los modelos coinciden. Lee [equipos de agentes y costos visibles](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs).

## Reanuda sin ocultar la incertidumbre

Una sesión tmux desconectada en el lado del servidor puede continuar tras desconectarse un portátil o un teléfono. El trabajo en un ordenador local apagado no puede. Un fallo del servidor, la presión de memoria y la pérdida de almacenamiento siguen requiriendo recuperación. Vuelve a conectarte al ID de tarea guardado e inspecciona su último evento confirmado antes de iniciar más trabajo. No repitas a ciegas una solicitud facturable cuyo resultado es desconocido. Consulta [desconexiones y recuperación](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Mantén visibles los costos y los datos

Revisa la cotización aceptada, el límite de la tarea, el importe reservado y el recibo de uso. Un recargo de servicio del 8% convertiría USD1.00 de uso del proveedor en USD1.08 antes de los cargos divulgados por separado; esto es un ejemplo, no una oferta de precio. Las cuotas de suscripción, los cargos del proveedor y los recursos del servidor son límites diferentes. El presupuesto adicional requiere una elección explícita.

Los archivos locales de credenciales de la CLI usan permisos solo para el propietario. Estos permisos no son cifrado ni una copia de seguridad. La carga de conocimientos es explícita; los archivos privados nunca deben entrar en un enlace de traspaso público. Los [traspasos de prompts](https://dsh.tvijo.com/knowledge/prompt-handoffs) explican cómo copiar una tarea revisada a otra herramienta.

El paquete de este repositorio está actualmente marcado como `UNLICENSED`; la publicación no otorga derechos de reutilización. Consulta los metadatos actuales del paquete y el aviso de licencia antes de redistribuir. Las traducciones son guías introductorias, generadas con DSHREM y verificadas para mantener la coherencia estructural; el inglés es la referencia para las discrepancias técnicas.
