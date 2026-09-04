# Puente de Impresión

Hace que una **impresora USB** conectada a una computadora se comporte como una **impresora de red**, para que el celular o la tablet le manden los tickets.

## Por qué hace falta

El USB es punto a punto: solo existe para la máquina donde está enchufada la impresora. Un celular no puede alcanzarla, por más que estén en la misma red.

Este puente escucha en el **puerto 9100** —el mismo que hablan las ticketeras de red— y le pasa a la impresora, tal cual, lo que llega. Para el sistema, esa computadora es una ticketera de red más: **no se cambia nada en la app**.

## Qué necesita

- Windows con la impresora ya instalada y funcionando por USB.
- Nada más. PowerShell ya viene con Windows; no se instala ningún programa.

## Cómo se usa

1. Copiar esta carpeta a la computadora que tiene la impresora.
2. Doble clic en **Iniciar-Puente.bat**. La ventana muestra la IP de esa computadora.
3. En el celular, desde la app: **Configuración → Impresora → Impresora de Caja**
   - IP: la que muestra la ventana
   - Puerto: `9100`
4. Dejar la ventana abierta mientras se atiende.

### Antes de gastar papel

Para comprobar que el celular llega hasta la computadora:

```
Iniciar-Puente.bat -SoloProbar
```

Recibe y avisa en pantalla, pero no imprime.

### Si hay varias impresoras

Por defecto usa la **predeterminada** de Windows. Para elegir otra:

```
Iniciar-Puente.bat -Impresora "EPSON TM-T20II Receipt"
```

El nombre tiene que ser exacto al de Windows (Configuración → Impresoras).

## Que arranque solo al prender la computadora

Copiar un acceso directo de `Iniciar-Puente.bat` en la carpeta de inicio:

1. Tecla Windows + R
2. Escribir `shell:startup` y Enter
3. Pegar ahí el acceso directo

## Si no imprime

**"No se pudo abrir el puerto 9100"** — hay otro programa usándolo. Probar con otro puerto (`-Puerto 9101`) y poner ese mismo número en el celular.

**El celular dice que no conecta** — casi siempre es una de tres:

1. El celular está en otra red (por ejemplo en datos móviles, o en una WiFi de invitados aislada). Tienen que estar en la **misma red**.
2. El Firewall de Windows está bloqueando. La primera vez Windows pregunta: hay que darle **Permitir**. Si se rechazó, se habilita con esto en PowerShell **como administrador**:
   ```
   New-NetFirewallRule -DisplayName "Puente de Impresion Cobrify" -Direction Inbound -Protocol TCP -LocalPort 9100 -Action Allow
   ```
3. La IP de la computadora cambió. El router suele repartir IPs distintas cada vez que se reinicia. **Conviene fijarle la IP** a esa computadora en el router; si no, cada tanto hay que corregir el número en el celular.

**Imprime símbolos raros o no corta el papel** — el envío es RAW (los bytes van sin que el driver los reinterprete), así que esto suele venir de la impresora, no del puente. Verificar que la ticketera sea ESC/POS y que el ancho de papel configurado en el sistema (58 u 80 mm) sea el correcto.

## Lo que hay que saber antes de recomendarlo

Funciona, pero **depende de que esa computadora esté prendida, con la ventana abierta y con la misma IP**. El día que alguien la apague, la mueva de red o el router le cambie el número, deja de imprimir — y para el cliente eso es "el sistema no imprime".

Si el local puede gastar, un **print server USB→Ethernet** (unos 40 dólares) hace lo mismo sin depender de ninguna computadora, y un modelo de ticketera con puerto de red no depende de nada. Este puente es la salida cuando no se quiere gastar.
