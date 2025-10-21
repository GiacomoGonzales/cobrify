# Ubigeos de Perú - Referencia

El **ubigeo** es el código de ubicación geográfica de 6 dígitos establecido por el INEI (Instituto Nacional de Estadística e Informática) que identifica de manera única un distrito en el Perú.

## Formato del Ubigeo

El código tiene 6 dígitos con el siguiente formato:
- **2 primeros dígitos**: Departamento
- **2 siguientes dígitos**: Provincia
- **2 últimos dígitos**: Distrito

Ejemplo: **150101**
- 15 = Lima (Departamento)
- 01 = Lima (Provincia)
- 01 = Lima (Distrito)

## Ubigeos más comunes

### Lima Metropolitana

| Distrito | Ubigeo | Provincia | Departamento |
|----------|--------|-----------|--------------|
| Lima | 150101 | Lima | Lima |
| Miraflores | 150122 | Lima | Lima |
| San Isidro | 150131 | Lima | Lima |
| San Borja | 150130 | Lima | Lima |
| Surco | 150141 | Lima | Lima |
| La Molina | 150117 | Lima | Lima |
| Jesús María | 150115 | Lima | Lima |
| Lince | 150118 | Lima | Lima |
| Magdalena | 150119 | Lima | Lima |
| Pueblo Libre | 150121 | Lima | Lima |
| San Miguel | 150132 | Lima | Lima |
| Breña | 150105 | Lima | Lima |
| Los Olivos | 150120 | Lima | Lima |
| San Martín de Porres | 150133 | Lima | Lima |
| Independencia | 150113 | Lima | Lima |
| Comas | 150107 | Lima | Lima |
| Carabayllo | 150106 | Lima | Lima |
| San Juan de Lurigancho | 150134 | Lima | Lima |
| El Agustino | 150111 | Lima | Lima |
| Santa Anita | 150137 | Lima | Lima |
| La Victoria | 150116 | Lima | Lima |
| Cercado de Lima | 150101 | Lima | Lima |
| Rímac | 150125 | Lima | Lima |
| Chorrillos | 150108 | Lima | Lima |
| Barranco | 150104 | Lima | Lima |
| Surquillo | 150140 | Lima | Lima |
| San Luis | 150142 | Lima | Lima |
| Villa El Salvador | 150142 | Lima | Lima |
| Villa María del Triunfo | 150143 | Lima | Lima |

### Lima Provincias

| Distrito | Ubigeo | Provincia | Departamento |
|----------|--------|-----------|--------------|
| Callao | 070101 | Callao | Callao |
| Bellavista | 070102 | Callao | Callao |
| La Perla | 070103 | Callao | Callao |
| La Punta | 070104 | Callao | Callao |
| Carmen de la Legua | 070105 | Callao | Callao |
| Ventanilla | 070106 | Callao | Callao |

### Principales Departamentos

| Departamento | Código | Capital | Ubigeo Capital |
|--------------|--------|---------|----------------|
| Amazonas | 01 | Chachapoyas | 010101 |
| Áncash | 02 | Huaraz | 020101 |
| Apurímac | 03 | Abancay | 030101 |
| Arequipa | 04 | Arequipa | 040101 |
| Ayacucho | 05 | Ayacucho | 050101 |
| Cajamarca | 06 | Cajamarca | 060101 |
| Callao | 07 | Callao | 070101 |
| Cusco | 08 | Cusco | 080101 |
| Huancavelica | 09 | Huancavelica | 090101 |
| Huánuco | 10 | Huánuco | 100101 |
| Ica | 11 | Ica | 110101 |
| Junín | 12 | Huancayo | 120101 |
| La Libertad | 13 | Trujillo | 130101 |
| Lambayeque | 14 | Chiclayo | 140101 |
| Lima | 15 | Lima | 150101 |
| Loreto | 16 | Iquitos | 160101 |
| Madre de Dios | 17 | Puerto Maldonado | 170101 |
| Moquegua | 18 | Moquegua | 180101 |
| Pasco | 19 | Cerro de Pasco | 190101 |
| Piura | 20 | Piura | 200101 |
| Puno | 21 | Puno | 210101 |
| San Martín | 22 | Moyobamba | 220101 |
| Tacna | 23 | Tacna | 230101 |
| Tumbes | 24 | Tumbes | 240101 |
| Ucayali | 25 | Pucallpa | 250101 |

## Cómo consultar el Ubigeo completo

1. **Portal del INEI**: [https://www.inei.gob.pe/](https://www.inei.gob.pe/)
2. **Portal de SUNAT**: En la sección de comprobantes electrónicos
3. **Reniec**: Consulta por DNI incluye ubigeo

## Ejemplo de uso en el sistema

Al configurar tu empresa en **Configuración > Información de la Empresa**, debes ingresar:

```
Dirección: Av. Javier Prado Este 560
Urbanización: (dejar vacío o "San Isidro")
Distrito: San Isidro
Provincia: Lima
Departamento: Lima
Ubigeo: 150131
```

## Notas importantes

- El ubigeo es **opcional** en el sistema, pero **recomendado** para SUNAT
- Si no ingresas ubigeo, se usará por defecto: **150101** (Lima Cercado)
- Para mayor precisión fiscal, siempre ingresa el ubigeo correcto
- El ubigeo debe coincidir con la dirección declarada en SUNAT

## Referencias

- [INEI - Códigos de Ubicación Geográfica](https://www.inei.gob.pe/media/MenuRecursivo/publicaciones_digitales/Est/Lib1541/index.html)
- [SUNAT - Facturación Electrónica](https://cpe.sunat.gob.pe/)
