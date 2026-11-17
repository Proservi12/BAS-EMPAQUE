sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ndc/BarcodeScanner",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel"
], (
    Controller,
    MessageToast,
    MessageBox,
    BarcodeScanner,
    Filter,
    FilterOperator,
    JSONModel
) => {
    "use strict";

    /*
     * Propiedades de ZE_MUBEASet que traen el usuario y la
     * contraseña. Si en el servicio se llaman diferente,
     * cambiarlas solo aquí.
     */

    const MUBEA_USER_FIELD = "ZUNAME";
    const MUBEA_PASS_FIELD = "ZPASSWD";

    return Controller.extend(
        "zew.newscan.zewnewscan.controller.View1",
        {
            // =====================================================
            // ================= INICIALIZACIÓN =====================
            // =====================================================
            onInit() {
                const oTarimasModel = new JSONModel({
                    items: []
                });

                /*
                 * Permite que el binding pueda manejar más de
                 * los 100 registros predeterminados.
                 */
                oTarimasModel.setSizeLimit(10000);

                this.getView().setModel(
                    oTarimasModel,
                    "tarimasModel"
                );

                const oImpresorasModel = new JSONModel({
                    items: [],
                    busy: false,
                    selectedPadestReimpresion: ""
                });

                oImpresorasModel.setSizeLimit(10000);

                this.getView().setModel(
                    oImpresorasModel,
                    "impresorasModel"
                );

                this._sPadestProcesar = "";

                /*
                 * La tabla renderiza los registros gradualmente,
                 * pero todos permanecen disponibles en el modelo.
                 */
                this._configureTarimasTable();
            },

            _configureTarimasTable() {
                const oTableTarimas = this.byId("tableTarimas");

                if (!oTableTarimas) {
                    return;
                }

                if (
                    typeof oTableTarimas.setGrowing ===
                    "function"
                ) {
                    oTableTarimas.setGrowing(true);
                }

                if (
                    typeof oTableTarimas.setGrowingThreshold ===
                    "function"
                ) {
                    oTableTarimas.setGrowingThreshold(200);
                }

                if (
                    typeof oTableTarimas.setGrowingScrollToLoad ===
                    "function"
                ) {
                    oTableTarimas.setGrowingScrollToLoad(true);
                }
            },

            // =====================================================
            // ================= UTILIDAD MODELOS ===================
            // =====================================================
            _getODataModel(sModelName) {
                return (
                    this.getView().getModel(sModelName) ||
                    this.getOwnerComponent().getModel(sModelName) ||
                    this.getView().getModel() ||
                    this.getOwnerComponent().getModel()
                );
            },

            // =====================================================
            // ================= ESCANEO PRINCIPAL ==================
            // =====================================================
            onScan() {
                BarcodeScanner.scan(
                    (oResult) => {
                        if (oResult.text) {
                            this.byId("inpScan").setValue(
                                oResult.text.trim()
                            );
                        }
                    },
                    () => {
                        MessageToast.show(
                            "Error al escanear"
                        );
                    }
                );
            },

            // =====================================================
            // ================= BUSCAR =============================
            // =====================================================
            onBuscar() {
                const sScan = this.byId(
                    "inpScan"
                ).getValue();

                if (!sScan) {
                    MessageBox.warning(
                        "Escanea primero"
                    );
                    return;
                }
                this.byId("inpScan").setValue("");
                this._sendEscaneo(sScan);
            },

            // =====================================================
            // ================= ENVÍO GENERAL ======================
            // =====================================================
            _sendEscaneo(sString, fnAfterSuccess) {
                if (!sString) {
                    MessageBox.warning(
                        "No se recibió valor para enviar"
                    );
                    return;
                }

                const oModel =
                    this._getODataModel();

                oModel.read("/ZE_ESCANEOSet", {
                    filters: [
                        new Filter(
                            "STRING",
                            FilterOperator.EQ,
                            sString
                        )
                    ],

                    success: (oData) => {
                        const sMessage =
                            oData.results?.[0]?.MESSAGE ||
                            "Proceso ejecutado";

                        MessageToast.show(sMessage);

                        if (
                            typeof fnAfterSuccess ===
                            "function"
                        ) {
                            fnAfterSuccess();
                        }

                        this._refreshTable();
                    },

                    error: () => {
                        MessageBox.error(
                            "Error en servicio de escaneo"
                        );
                    }
                });
            },

            // =====================================================
            // ================= ACTUALIZAR TABLA ===================
            // =====================================================
            _refreshTable(bSilent) {
                const oTableModel =
                    this._getODataModel("tableModel");

                const oTable =
                    this.byId("table");

                const oBinding = oTable
                    ? oTable.getBinding("items")
                    : null;

                oTableModel.read("/ZE_TABLESet", {
                    success: () => {
                        if (oBinding) {
                            oBinding.refresh(true);
                        }

                        oTableModel.refresh(true);

                        /*
                         * Cuando bSilent es true no se muestra
                         * "Tabla actualizada".
                         *
                         * Esto se utiliza en Procesar para mostrar
                         * exclusivamente MESSAGE del OData.
                         */
                        if (!bSilent) {
                            MessageToast.show(
                                "Tabla actualizada"
                            );
                        }
                    },

                    error: () => {
                        if (!bSilent) {
                            MessageBox.error(
                                "Error al cargar tabla"
                            );
                        }
                    }
                });
            },

            // =====================================================
            // ================= TARIMAS ============================
            // =====================================================
            onTarimas() {
                const oModel =
                    this._getODataModel();

                const aAllResults = [];
                const mVisitedLinks =
                    Object.create(null);

                /*
                 * Se solicita una cantidad amplia en la primera
                 * petición y, si Gateway devuelve __next, se
                 * siguen cargando todas las páginas.
                 */
                this._readAllTarimaPages(
                    oModel,
                    "/ZE_TARIMASSet",
                    {
                        "$top": "10000"
                    },
                    aAllResults,
                    mVisitedLinks,

                    (aResults) => {
                        const sMessage = String(
                            aResults[0]?.MESSAGE || ""
                        ).trim();

                        const bHasTarimas =
                            aResults.some((oItem) => {
                                return Boolean(
                                    oItem &&
                                    (
                                        oItem.MATNR ||
                                        oItem.MAKTX
                                    )
                                );
                            });

                        if (
                            sMessage ===
                            "Escanear tarima."
                        ) {
                            this._openTarimaScanDialog();
                            return;
                        }

                        if (
                            sMessage ===
                            "Seleccione una tarima del listado." ||
                            bHasTarimas
                        ) {
                            this._openTarimasListDialog(
                                aResults
                            );
                            return;
                        }

                        if (sMessage) {
                            MessageBox.information(
                                sMessage
                            );
                        }
                    },

                    (oError) => {
                        const sMessage =
                            this._getODataErrorMessage(
                                oError
                            );

                        if (sMessage) {
                            MessageBox.error(
                                sMessage
                            );
                        } else {
                            MessageBox.error(
                                "Error al consultar tarimas"
                            );
                        }
                    }
                );
            },

            /**
             * Lee todas las páginas de ZE_TARIMASSet.
             *
             * @param {sap.ui.model.odata.v2.ODataModel} oModel
             * Modelo OData.
             * @param {string} sPath Ruta que se consultará.
             * @param {object} mUrlParameters Parámetros OData.
             * @param {Array} aCollected Registros acumulados.
             * @param {object} mVisitedLinks Enlaces ya procesados.
             * @param {Function} fnSuccess Función de éxito.
             * @param {Function} fnError Función de error.
             */
            _readAllTarimaPages(
                oModel,
                sPath,
                mUrlParameters,
                aCollected,
                mVisitedLinks,
                fnSuccess,
                fnError
            ) {
                oModel.read(sPath, {
                    urlParameters:
                        mUrlParameters || {},

                    success: (oData) => {
                        const aPageResults =
                            Array.isArray(
                                oData?.results
                            )
                                ? oData.results
                                : [];

                        Array.prototype.push.apply(
                            aCollected,
                            aPageResults
                        );

                        const sNextLink = String(
                            oData?.__next || ""
                        );

                        if (!sNextLink) {
                            fnSuccess(aCollected);
                            return;
                        }

                        /*
                         * Evita un ciclo infinito si el backend
                         * devuelve accidentalmente el mismo enlace.
                         */
                        if (
                            mVisitedLinks[sNextLink]
                        ) {
                            fnSuccess(aCollected);
                            return;
                        }

                        mVisitedLinks[sNextLink] =
                            true;

                        const oNextRequest =
                            this._parseODataNextLink(
                                oModel,
                                sNextLink,
                                sPath
                            );

                        this._readAllTarimaPages(
                            oModel,
                            oNextRequest.path,
                            oNextRequest.urlParameters,
                            aCollected,
                            mVisitedLinks,
                            fnSuccess,
                            fnError
                        );
                    },

                    error: (oError) => {
                        fnError(oError);
                    }
                });
            },

            /**
             * Convierte el enlace __next de OData en una ruta
             * y parámetros compatibles con ODataModel.read().
             */
            _parseODataNextLink(
                oModel,
                sNextLink,
                sFallbackPath
            ) {
                const sCleanLink = String(
                    sNextLink || ""
                ).replace(/&amp;/g, "&");

                let sReadPath =
                    sFallbackPath;

                const mUrlParameters = {};

                try {
                    const sBaseUrl =
                        window.location.origin;

                    const oNextUrl = new URL(
                        sCleanLink,
                        sBaseUrl
                    );

                    const sServiceUrl = String(
                        oModel.sServiceUrl || ""
                    );

                    let sServicePath = "";

                    if (sServiceUrl) {
                        const oServiceUrl =
                            new URL(
                                sServiceUrl,
                                sBaseUrl
                            );

                        sServicePath =
                            oServiceUrl.pathname.replace(
                                /\/+$/,
                                ""
                            );
                    }

                    let sNextPath =
                        oNextUrl.pathname;

                    if (
                        sServicePath &&
                        sNextPath.indexOf(
                            sServicePath
                        ) === 0
                    ) {
                        sNextPath =
                            sNextPath.substring(
                                sServicePath.length
                            );
                    }

                    if (sNextPath) {
                        sReadPath =
                            sNextPath.charAt(0) === "/"
                                ? sNextPath
                                : "/" + sNextPath;
                    }

                    oNextUrl.searchParams.forEach(
                        (sValue, sKey) => {
                            mUrlParameters[sKey] =
                                sValue;
                        }
                    );
                } catch (oError) {
                    const iQuestionMark =
                        sCleanLink.indexOf("?");

                    const sPathPart =
                        iQuestionMark >= 0
                            ? sCleanLink.substring(
                                0,
                                iQuestionMark
                            )
                            : sCleanLink;

                    const sQueryPart =
                        iQuestionMark >= 0
                            ? sCleanLink.substring(
                                iQuestionMark + 1
                            )
                            : "";

                    const sServiceUrl = String(
                        oModel.sServiceUrl || ""
                    ).replace(/\/+$/, "");

                    let sRelativePath =
                        sPathPart;

                    if (
                        sServiceUrl &&
                        sRelativePath.indexOf(
                            sServiceUrl
                        ) === 0
                    ) {
                        sRelativePath =
                            sRelativePath.substring(
                                sServiceUrl.length
                            );
                    }

                    if (sRelativePath) {
                        sReadPath =
                            sRelativePath.charAt(0) ===
                            "/"
                                ? sRelativePath
                                : "/" + sRelativePath;
                    }

                    if (sQueryPart) {
                        sQueryPart
                            .split("&")
                            .forEach((sParameter) => {
                                if (!sParameter) {
                                    return;
                                }

                                const iEquals =
                                    sParameter.indexOf(
                                        "="
                                    );

                                const sRawKey =
                                    iEquals >= 0
                                        ? sParameter.substring(
                                            0,
                                            iEquals
                                        )
                                        : sParameter;

                                const sRawValue =
                                    iEquals >= 0
                                        ? sParameter.substring(
                                            iEquals + 1
                                        )
                                        : "";

                                const sKey =
                                    decodeURIComponent(
                                        sRawKey
                                    );

                                const sValue =
                                    decodeURIComponent(
                                        sRawValue
                                    );

                                mUrlParameters[sKey] =
                                    sValue;
                            });
                    }
                }

                return {
                    path: sReadPath,
                    urlParameters:
                        mUrlParameters
                };
            },

            _openTarimaScanDialog() {
                this.byId(
                    "inpTarimaScan"
                ).setValue("");

                this.byId(
                    "dialogTarimaScan"
                ).open();
            },

            onScanTarimaDialog() {
                BarcodeScanner.scan(
                    (oResult) => {
                        if (oResult.text) {
                            const sScan =
                                oResult.text.trim();

                            this.byId(
                                "inpTarimaScan"
                            ).setValue(sScan);

                            this._sendEscaneo(
                                sScan,
                                () => {
                                    this.byId(
                                        "dialogTarimaScan"
                                    ).close();
                                }
                            );
                        }
                    },

                    () => {
                        MessageToast.show(
                            "Error al escanear tarima"
                        );
                    }
                );
            },

            onEnviarTarimaEscaneada() {
                const sScan = this.byId(
                    "inpTarimaScan"
                ).getValue();

                if (!sScan) {
                    MessageBox.warning(
                        "Escanea o ingresa una tarima"
                    );
                    return;
                }

                this._sendEscaneo(
                    sScan,
                    () => {
                        this.byId(
                            "dialogTarimaScan"
                        ).close();
                    }
                );
            },

            onCancelarTarimaScan() {
                this.byId(
                    "dialogTarimaScan"
                ).close();

                MessageToast.show(
                    "Acción cancelada"
                );
            },

            _openTarimasListDialog(aResults) {
                /*
                 * Se conserva el filtro original para no mostrar
                 * como fila vacía el registro que solamente
                 * contiene MESSAGE.
                 *
                 * No se limita la cantidad de tarimas.
                 */
                const aTarimas =
                    Array.isArray(aResults)
                        ? aResults.filter(
                            (oItem) => {
                                return Boolean(
                                    oItem &&
                                    (
                                        oItem.MATNR ||
                                        oItem.MAKTX
                                    )
                                );
                            }
                        )
                        : [];

                if (!aTarimas.length) {
                    MessageBox.warning(
                        "No se recibieron tarimas para seleccionar"
                    );
                    return;
                }

                const oTarimasModel =
                    this.getView().getModel(
                        "tarimasModel"
                    );

                /*
                 * Ajusta dinámicamente el límite según la
                 * cantidad real recibida.
                 */
                oTarimasModel.setSizeLimit(
                    Math.max(
                        aTarimas.length + 100,
                        10000
                    )
                );

                oTarimasModel.setProperty(
                    "/items",
                    aTarimas.slice()
                );

                oTarimasModel.updateBindings(
                    true
                );

                const oTableTarimas =
                    this.byId("tableTarimas");

                if (oTableTarimas) {
                    oTableTarimas.removeSelections(
                        true
                    );

                    const oBinding =
                        oTableTarimas.getBinding(
                            "items"
                        );

                    if (oBinding) {
                        oBinding.refresh(true);
                    }
                }

                this.byId(
                    "dialogTarimasList"
                ).open();
            },

            onTarimaListSelectionChange(oEvent) {
                const oItem =
                    oEvent.getParameter(
                        "listItem"
                    );

                if (!oItem) {
                    return;
                }

                const oContext =
                    oItem.getBindingContext(
                        "tarimasModel"
                    );

                if (!oContext) {
                    MessageBox.error(
                        "No se pudo obtener la tarima seleccionada"
                    );
                    return;
                }

                const oTarima =
                    oContext.getObject();

                const sMatnr =
                    oTarima.MATNR;

                if (!sMatnr) {
                    MessageBox.warning(
                        "La tarima seleccionada no tiene material"
                    );
                    return;
                }

                this.byId(
                    "dialogTarimasList"
                ).close();

                this._sendEscaneo(sMatnr);
            },

            onCancelarTarimaList() {
                this.byId(
                    "dialogTarimasList"
                ).close();

                MessageToast.show(
                    "Acción cancelada"
                );
            },

            // =====================================================
            // ================= ELIMINAR ===========================
            // =====================================================
            onEliminar() {
                const oTable =
                    this.byId("table");

                const aItems =
                    oTable.getSelectedItems();

                if (!aItems.length) {
                    MessageBox.warning(
                        "Selecciona al menos un registro"
                    );
                    return;
                }

                const aRows = aItems
                    .map((oItem) => {
                        const oContext =
                            oItem.getBindingContext(
                                "tableModel"
                            ) ||
                            oItem.getBindingContext();

                        return oContext
                            ? oContext.getObject()
                            : null;
                    })
                    .filter(Boolean);

                const bHasInvalidRow =
                    aRows.some((oRow) => {
                        return (
                            oRow.ID === undefined ||
                            oRow.ID === null ||
                            oRow.ID === "" ||
                            oRow.MATNR === undefined ||
                            oRow.MATNR === null ||
                            oRow.MATNR === "" ||
                            oRow.CHARG === undefined ||
                            oRow.CHARG === null ||
                            oRow.CHARG === ""
                        );
                    });

                /*
                 * Se conserva el comportamiento original.
                 */
                if (bHasInvalidRow) {
                    // Validación original desactivada.
                }

                MessageBox.confirm(
                    "¿Deseas eliminar " +
                    aRows.length +
                    " registro(s)?",
                    {
                        actions: [
                            MessageBox.Action.YES,
                            MessageBox.Action.NO
                        ],

                        emphasizedAction:
                            MessageBox.Action.YES,

                        onClose: (sAction) => {
                            if (
                                sAction !==
                                MessageBox.Action.YES
                            ) {
                                return;
                            }

                            this._deleteRowsSequential(
                                aRows,
                                0
                            );
                        }
                    }
                );
            },

            _deleteRowsSequential(
                aRows,
                iIndex
            ) {
                if (
                    iIndex >=
                    aRows.length
                ) {
                    const oTable =
                        this.byId("table");

                    if (oTable) {
                        oTable.removeSelections(
                            true
                        );
                    }

                    MessageToast.show(
                        "Registro(s) eliminado(s)"
                    );

                    this._refreshTable();
                    return;
                }

                const oModel =
                    this._getODataModel(
                        "tableModel"
                    );

                const oRow =
                    aRows[iIndex];

                const sPath =
                    oModel.createKey(
                        "/ZE_TABLESet",
                        {
                            ID: oRow.ID,
                            MATNR: oRow.MATNR,
                            CHARG: oRow.CHARG
                        }
                    );

                oModel.remove(sPath, {
                    success: () => {
                        this._deleteRowsSequential(
                            aRows,
                            iIndex + 1
                        );
                    },

                    error: () => {
                        MessageBox.error(
                            "Error al eliminar el registro " +
                            (iIndex + 1)
                        );

                        this._refreshTable();
                    }
                });
            },

            // =====================================================
            // ================= PROCESAR / HU ======================
            // =====================================================
            onProcesar() {
                this._loadImpresoras(() => {
                    this._openImpresorasProcesarDialog();
                });
            },

            _loadImpresoras(fnAfterLoad) {
                const oImpresorasModel =
                    this.getView().getModel(
                        "impresorasModel"
                    );

                const aCurrentItems =
                    oImpresorasModel.getProperty(
                        "/items"
                    ) || [];

                if (aCurrentItems.length) {
                    if (
                        typeof fnAfterLoad ===
                        "function"
                    ) {
                        fnAfterLoad(
                            aCurrentItems
                        );
                    }

                    return;
                }

                const oModel =
                    this._getODataModel();

                oImpresorasModel.setProperty(
                    "/busy",
                    true
                );

                oModel.read(
                    "/ZE_IMPRESORASSet",
                    {
                        success: (oData) => {
                            const aImpresoras =
                                this._normalizeImpresoras(
                                    oData.results ||
                                    []
                                );

                            oImpresorasModel.setSizeLimit(
                                Math.max(
                                    aImpresoras.length +
                                    100,
                                    10000
                                )
                            );

                            oImpresorasModel.setProperty(
                                "/items",
                                aImpresoras
                            );

                            oImpresorasModel.setProperty(
                                "/busy",
                                false
                            );

                            if (
                                !aImpresoras.length
                            ) {
                                MessageBox.warning(
                                    "No se recibieron impresoras para seleccionar"
                                );
                                return;
                            }

                            if (
                                typeof fnAfterLoad ===
                                "function"
                            ) {
                                fnAfterLoad(
                                    aImpresoras
                                );
                            }
                        },

                        error: () => {
                            oImpresorasModel.setProperty(
                                "/busy",
                                false
                            );

                            MessageBox.error(
                                "Error al consultar impresoras"
                            );
                        }
                    }
                );
            },

            _normalizeImpresoras(aResults) {
                return aResults
                    .map((oItem) => {
                        const sPadest =
                            String(
                                oItem.PADEST ||
                                oItem.NAME ||
                                ""
                            ).trim();

                        const sName =
                            String(
                                oItem.NAME || ""
                            ).trim();

                        const sStandort =
                            String(
                                oItem.PASTANDORT ||
                                ""
                            ).trim();

                        return Object.assign(
                            {},
                            oItem,
                            {
                                _PADEST_KEY:
                                    sPadest,

                                _DISPLAY: [
                                    sName,
                                    sStandort
                                ]
                                    .filter(Boolean)
                                    .join(" - ")
                            }
                        );
                    })
                    .filter((oItem) => {
                        return oItem._PADEST_KEY;
                    });
            },

            _openImpresorasProcesarDialog() {
                this._sPadestProcesar = "";

                const oTable = this.byId(
                    "tableImpresorasProcesar"
                );

                if (oTable) {
                    oTable.removeSelections(
                        true
                    );
                }

                this.byId(
                    "dialogImpresorasProcesar"
                ).open();
            },

            onContinuarImpresoraProcesar() {
                const oTable = this.byId(
                    "tableImpresorasProcesar"
                );

                const oSelectedItem =
                    oTable
                        ? oTable.getSelectedItem()
                        : null;

                if (!oSelectedItem) {
                    MessageBox.warning(
                        "Selecciona una impresora"
                    );
                    return;
                }

                const oContext =
                    oSelectedItem.getBindingContext(
                        "impresorasModel"
                    );

                const oImpresora =
                    oContext
                        ? oContext.getObject()
                        : null;

                const sPadest =
                    oImpresora
                        ? oImpresora._PADEST_KEY
                        : "";

                if (!sPadest) {
                    MessageBox.warning(
                        "La impresora seleccionada no tiene destino de impresión"
                    );
                    return;
                }

                this._sPadestProcesar =
                    sPadest;

                this.byId(
                    "dialogImpresorasProcesar"
                ).close();

                this._procesarConImpresora(
                    sPadest
                );
            },

            onCerrarImpresoraProcesar() {
                this._sPadestProcesar = "";

                this.byId(
                    "dialogImpresorasProcesar"
                ).close();

                /*
                 * No se muestra texto adicional porque
                 * esta acción pertenece al flujo Procesar.
                 */
            },

            _procesarConImpresora(sPadest, sAutoriza) {
                if (!sPadest) {
                    MessageBox.warning(
                        "Selecciona una impresora"
                    );
                    return;
                }

                const oModel =
                    this._getODataModel(
                        "huModel"
                    );

                const aFilters = [
                    new Filter(
                        "PADEST",
                        FilterOperator.EQ,
                        sPadest
                    )
                ];

                /*
                 * MUBEA: ya validado el usuario, se envía
                 * AUTORIZA = usuario que aprobó.
                 */
                if (sAutoriza) {
                    aFilters.push(
                        new Filter(
                            "AUTORIZA",
                            FilterOperator.EQ,
                            sAutoriza
                        )
                    );
                }

                oModel.read("/ZE_HUSet", {
                    filters: aFilters,

                    success: (oData) => {
                        const oResult =
                            oData.results?.[0] ||
                            {};

                        const sBase64 =
                            oResult.ETIQUETA;

                        /*
                         * Se utiliza únicamente MESSAGE.
                         * No se concatena EXIDV.
                         * No se utiliza "Proceso ejecutado".
                         */
                        const sMessage =
                            oResult.MESSAGE ===
                                undefined ||
                            oResult.MESSAGE === null
                                ? ""
                                : String(
                                    oResult.MESSAGE
                                );

                        const bHasMessage =
                            sMessage.trim() !== "";

                        /*
                         * MUBEA: si regresa AUTORIZA = 'MUBEA'
                         * se pide usuario y contraseña. Solo en
                         * la primera llamada (sin AUTORIZA) para
                         * que no se cicle.
                         */
                        if (
                            !sAutoriza &&
                            this._isMubeaResult(
                                oResult
                            )
                        ) {
                            this._openMubeaDialog(
                                sMessage,
                                sPadest
                            );
                            return;
                        }

                        if (
                            this._isSobrepesoMessage(
                                sMessage
                            )
                        ) {
                            this._openAutorizacionDialog(
                                sMessage,
                                sPadest
                            );
                            return;
                        }

                        if (sBase64) {
                            if (bHasMessage) {
                                MessageBox.information(
                                    sMessage,
                                    {
                                        onClose:
                                            () => {
                                                this._openPDF(
                                                    sBase64
                                                );

                                                this._refreshTable(
                                                    true
                                                );
                                            }
                                    }
                                );
                            } else {
                                this._openPDF(
                                    sBase64
                                );

                                this._refreshTable(
                                    true
                                );
                            }

                            return;
                        }

                        if (bHasMessage) {
                            MessageBox.information(
                                sMessage,
                                {
                                    onClose:
                                        () => {
                                            this._refreshTable(
                                                true
                                            );
                                        }
                                }
                            );
                        } else {
                            /*
                             * Si MESSAGE viene vacío no se inventa
                             * ningún texto.
                             */
                            this._refreshTable(
                                true
                            );
                        }
                    },

                    error: (oError) => {
                        const sMessage =
                            this._getODataErrorMessage(
                                oError
                            );

                        /*
                         * Solo se presenta el mensaje entregado
                         * por el servicio OData.
                         */
                        if (sMessage) {
                            MessageBox.error(
                                sMessage
                            );
                        }
                    }
                });
            },

            _isSobrepesoMessage(sMessage) {
                const sText = String(
                    sMessage || ""
                ).trim();

                return (
                    sText.indexOf(
                        "Existe un sobrepeso, se requiere autorización."
                    ) !== -1
                );
            },

            _openAutorizacionDialog(
                sMessage,
                sPadest
            ) {
                this._sPadestProcesar =
                    sPadest ||
                    this._sPadestProcesar;

                this.byId(
                    "txtAuthMessage"
                ).setText(sMessage);

                this.byId(
                    "inpAuthCode"
                ).setValue("");

                this.byId(
                    "dialogAutorizacion"
                ).open();
            },

            onAutorizarSobrepeso() {
                const sCode = this.byId(
                    "inpAuthCode"
                ).getValue();

                const sPadest =
                    this._sPadestProcesar;

                if (!sCode) {
                    MessageBox.warning(
                        "Ingresa la contraseña"
                    );
                    return;
                }

                if (!sPadest) {
                    MessageBox.warning(
                        "No se tiene impresora seleccionada para autorizar"
                    );
                    return;
                }

                const oModel =
                    this._getODataModel(
                        "huModel"
                    );

                oModel.read(
                    "/ZE_AUTORIZARSet",
                    {
                        filters: [
                            new Filter(
                                "CODE",
                                FilterOperator.EQ,
                                sCode
                            ),

                            new Filter(
                                "PADEST",
                                FilterOperator.EQ,
                                sPadest
                            )
                        ],

                        success: (oData) => {
                            const oResult =
                                oData.results?.[0] ||
                                {};

                            const sBase64 =
                                oResult.ETIQUETA;

                            /*
                             * También aquí se usa solamente
                             * MESSAGE devuelto por OData.
                             */
                            const sMessage =
                                oResult.MESSAGE ===
                                    undefined ||
                                oResult.MESSAGE ===
                                    null
                                    ? ""
                                    : String(
                                        oResult.MESSAGE
                                    );

                            const bHasMessage =
                                sMessage.trim() !==
                                "";

                            this.byId(
                                "dialogAutorizacion"
                            ).close();

                            if (sBase64) {
                                if (bHasMessage) {
                                    MessageBox.information(
                                        sMessage,
                                        {
                                            onClose:
                                                () => {
                                                    this._openPDF(
                                                        sBase64
                                                    );

                                                    this._refreshTable(
                                                        true
                                                    );
                                                }
                                        }
                                    );
                                } else {
                                    this._openPDF(
                                        sBase64
                                    );

                                    this._refreshTable(
                                        true
                                    );
                                }

                                return;
                            }

                            if (bHasMessage) {
                                MessageBox.information(
                                    sMessage,
                                    {
                                        onClose:
                                            () => {
                                                this._refreshTable(
                                                    true
                                                );
                                            }
                                    }
                                );
                            } else {
                                this._refreshTable(
                                    true
                                );
                            }
                        },

                        error: (oError) => {
                            const sMessage =
                                this._getODataErrorMessage(
                                    oError
                                );

                            if (sMessage) {
                                MessageBox.error(
                                    sMessage
                                );
                            }
                        }
                    }
                );
            },

            onCloseAutorizacionDialog() {
                this._sPadestProcesar = "";

                this.byId(
                    "dialogAutorizacion"
                ).close();

                /*
                 * No se muestra texto adicional.
                 */
            },

            /**
             * Extrae el mensaje enviado por un error OData.
             *
             * @param {object} oError Error del modelo OData.
             * @returns {string} Mensaje del backend.
             */
            _getODataErrorMessage(oError) {
                if (!oError) {
                    return "";
                }

                try {
                    const sResponseText =
                        oError.responseText ||
                        oError.response?.responseText ||
                        "";

                    if (sResponseText) {
                        const oResponse =
                            JSON.parse(
                                sResponseText
                            );

                        const sMainMessage =
                            oResponse?.error
                                ?.message?.value ||
                            oResponse?.error
                                ?.message ||
                            "";

                        if (
                            typeof sMainMessage ===
                                "string" &&
                            sMainMessage.trim()
                        ) {
                            return sMainMessage.trim();
                        }

                        const aDetails =
                            oResponse?.error
                                ?.innererror
                                ?.errordetails ||
                            [];

                        const oDetail =
                            aDetails.find(
                                (oItem) => {
                                    return Boolean(
                                        oItem?.message
                                    );
                                }
                            );

                        if (oDetail?.message) {
                            return String(
                                oDetail.message
                            ).trim();
                        }
                    }
                } catch (oParseError) {
                    // No se inventa un mensaje.
                }

                return "";
            },

            // =====================================================
            // ================= AUTORIZACIÓN MUBEA =================
            // =====================================================
            _isMubeaResult(oResult) {
                return (
                    String(
                        oResult?.AUTORIZA || ""
                    )
                        .trim()
                        .toUpperCase() === "MUBEA"
                );
            },

            _openMubeaDialog(
                sMessage,
                sPadest
            ) {
                this._sPadestProcesar =
                    sPadest ||
                    this._sPadestProcesar;

                const sText = String(
                    sMessage || ""
                ).trim();

                this.byId(
                    "txtMubeaMessage"
                ).setText(
                    sText ||
                    "Se requiere autorización MUBEA. Ingresa usuario y contraseña."
                );

                this.byId(
                    "inpMubeaUser"
                ).setValue("");

                this.byId(
                    "inpMubeaPass"
                ).setValue("");

                this.byId(
                    "dialogMubea"
                ).open();
            },

            onValidarMubea() {
                const oDialog =
                    this.byId("dialogMubea");

                /*
                 * Evita doble envío (Enter + botón).
                 */
                if (oDialog.getBusy()) {
                    return;
                }

                const sUser = this.byId(
                    "inpMubeaUser"
                )
                    .getValue()
                    .trim();

                const sPass = this.byId(
                    "inpMubeaPass"
                )
                    .getValue()
                    .trim();

                const sPadest =
                    this._sPadestProcesar;

                if (!sUser) {
                    MessageBox.warning(
                        "Ingresa el usuario"
                    );
                    return;
                }

                if (!sPass) {
                    MessageBox.warning(
                        "Ingresa la contraseña"
                    );
                    return;
                }

                if (!sPadest) {
                    MessageBox.warning(
                        "No se tiene impresora seleccionada para autorizar"
                    );
                    return;
                }

                const oModel =
                    this._getODataModel(
                        "huModel"
                    );

                oDialog.setBusy(true);

                oModel.read("/ZE_MUBEASet", {
                    success: (oData) => {
                        oDialog.setBusy(false);

                        const aUsuarios =
                            Array.isArray(
                                oData?.results
                            )
                                ? oData.results
                                : [];

                        const sUserUpper =
                            sUser.toUpperCase();

                        /*
                         * Usuario sin importar mayúsculas,
                         * contraseña exacta.
                         */
                        const oAprobador =
                            aUsuarios.find(
                                (oItem) => {
                                    const sItemUser =
                                        String(
                                            oItem?.[MUBEA_USER_FIELD] || ""
                                        )
                                            .trim()
                                            .toUpperCase();

                                    const sItemPass =
                                        String(
                                            oItem?.[MUBEA_PASS_FIELD] || ""
                                        ).trim();

                                    return (
                                        sItemUser ===
                                            sUserUpper &&
                                        sItemPass ===
                                            sPass
                                    );
                                }
                            );

                        this._closeMubeaDialog();

                        if (!oAprobador) {
                            this._sPadestProcesar =
                                "";

                            MessageBox.error(
                                "Usuario o contraseña incorrectos"
                            );
                            return;
                        }

                        /*
                         * Sigue el proceso normal enviando
                         * AUTORIZA = usuario que aprobó.
                         */
                        const sAprobador = String(
                            oAprobador[MUBEA_USER_FIELD]
                        ).trim();

                        this._procesarConImpresora(
                            sPadest,
                            sAprobador
                        );
                    },

                    error: (oError) => {
                        oDialog.setBusy(false);

                        const sMessage =
                            this._getODataErrorMessage(
                                oError
                            );

                        MessageBox.error(
                            sMessage ||
                            "Error al validar usuario MUBEA"
                        );
                    }
                });
            },

            onCancelarMubea() {
                this._sPadestProcesar = "";

                this._closeMubeaDialog();
            },

            _closeMubeaDialog() {
                this.byId(
                    "inpMubeaPass"
                ).setValue("");

                this.byId(
                    "dialogMubea"
                ).close();
            },

            // =====================================================
            // ================= REIMPRESIÓN ========================
            // =====================================================
            onOpenReimpresionDialog() {
                this._loadImpresoras(
                    (aImpresoras) => {
                        const oImpresorasModel =
                            this.getView().getModel(
                                "impresorasModel"
                            );

                        const sSelectedPadest =
                            oImpresorasModel.getProperty(
                                "/selectedPadestReimpresion"
                            );

                        if (
                            !sSelectedPadest &&
                            aImpresoras.length === 1
                        ) {
                            oImpresorasModel.setProperty(
                                "/selectedPadestReimpresion",
                                aImpresoras[0]
                                    ._PADEST_KEY
                            );
                        }

                        this.byId(
                            "dialogReimpresion"
                        ).open();
                    }
                );
            },

            onCloseReimpresionDialog() {
                this.byId(
                    "dialogReimpresion"
                ).close();
            },

            onImprimirHU() {
                const sHU = this.byId(
                    "inpHU"
                ).getValue();

                const sPadest =
                    this.getView()
                        .getModel(
                            "impresorasModel"
                        )
                        .getProperty(
                            "/selectedPadestReimpresion"
                        );

                if (!sHU) {
                    MessageBox.warning(
                        "Ingresa HU"
                    );
                    return;
                }

                if (!sPadest) {
                    MessageBox.warning(
                        "Selecciona una impresora"
                    );
                    return;
                }

                const oModel =
                    this._getODataModel(
                        "printModel"
                    );

                oModel.read(
                    "/ZE_IMPRESIONSet",
                    {
                        filters: [
                            new Filter(
                                "EXIDV",
                                FilterOperator.EQ,
                                sHU
                            ),

                            new Filter(
                                "PADEST",
                                FilterOperator.EQ,
                                sPadest
                            )
                        ],

                        success: (oData) => {
                            const sBase64 =
                                oData.results?.[0]
                                    ?.ETIQUETA;

                            if (!sBase64) {
                                MessageBox.error(
                                    "No se recibió PDF"
                                );
                                return;
                            }

                            this._openPDF(
                                sBase64
                            );

                            this.byId(
                                "dialogReimpresion"
                            ).close();
                        },

                        error: () => {
                            MessageBox.error(
                                "Error en reimpresión"
                            );
                        }
                    }
                );
            },

            // =====================================================
            // ================= ABRIR PDF ==========================
            // =====================================================
            _openPDF(sBase64) {
                try {
                    const sCleanBase64 =
                        sBase64.replace(
                            /^data:application\/pdf;base64,/,
                            ""
                        );

                    const byteCharacters =
                        atob(sCleanBase64);

                    const byteNumbers =
                        new Array(
                            byteCharacters.length
                        );

                    for (
                        let i = 0;
                        i <
                        byteCharacters.length;
                        i++
                    ) {
                        byteNumbers[i] =
                            byteCharacters.charCodeAt(
                                i
                            );
                    }

                    const byteArray =
                        new Uint8Array(
                            byteNumbers
                        );

                    const blob =
                        new Blob(
                            [byteArray],
                            {
                                type:
                                    "application/pdf"
                            }
                        );

                    const sUrl =
                        URL.createObjectURL(
                            blob
                        );

                    window.open(
                        sUrl,
                        "_blank"
                    );
                } catch (oError) {
                    MessageBox.error(
                        "Error al convertir la etiqueta PDF"
                    );
                }
            }
        }
    );
});