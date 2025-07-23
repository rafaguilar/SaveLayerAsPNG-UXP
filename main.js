// main.js - UXP Plugin for Photoshop Layer Export
const { app, action, core } = require('photoshop');
const fs = require('uxp').storage.localFileSystem;
const shell = require('uxp').shell;

class LayerExportPlugin {
    constructor() {
        this.foundLayers = [];
        this.selectedLayer = null;
        this.exportFolder = null;
        this.isExporting = false;
        this.cancelRequested = false;
        
        this.init();
    }
    
    async init() {
        this.bindEvents();
        await this.checkDocument();
        this.log('Layer Export Plugin initialized', 'info');
    }
    
    bindEvents() {
        // DOM Elements
        this.elements = {
            layerName: document.getElementById('layerName'),
            exactMatch: document.getElementById('exactMatch'),
            findLayers: document.getElementById('findLayers'),
            selectionSection: document.getElementById('selectionSection'),
            layerList: document.getElementById('layerList'),
            layerCount: document.getElementById('layerCount'),
            exportPath: document.getElementById('exportPath'),
            browsePath: document.getElementById('browsePath'),
            filePrefix: document.getElementById('filePrefix'),
            compressionLevel: document.getElementById('compressionLevel'),
            trimTransparent: document.getElementById('trimTransparent'),
            showInFinder: document.getElementById('showInFinder'),
            exportSelected: document.getElementById('exportSelected'),
            exportAll: document.getElementById('exportAll'),
            progressSection: document.getElementById('progressSection'),
            progressFill: document.getElementById('progressFill'),
            progressText: document.getElementById('progressText'),
            progressPercent: document.getElementById('progressPercent'),
            progressLabel: document.getElementById('progressLabel'),
            cancelExport: document.getElementById('cancelExport'),
            statusIndicator: document.getElementById('statusIndicator'),
            statusText: document.getElementById('statusText'),
            statusLog: document.getElementById('statusLog'),
            clearLog: document.getElementById('clearLog')
        };
        
        // Event Listeners
        this.elements.findLayers.addEventListener('click', () => this.findLayers());
        this.elements.browsePath.addEventListener('click', () => this.browseExportPath());
        this.elements.exportSelected.addEventListener('click', () => this.exportSelectedLayer());
        this.elements.exportAll.addEventListener('click', () => this.exportAllLayers());
        this.elements.cancelExport.addEventListener('click', () => this.cancelExport());
        this.elements.clearLog.addEventListener('click', () => this.clearLog());
        
        // Enter key support
        this.elements.layerName.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.findLayers();
            }
        });
        
        // Auto-search with debounce
        let searchTimeout;
        this.elements.layerName.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const value = this.elements.layerName.value.trim();
            if (value.length >= 2) {
                searchTimeout = setTimeout(() => this.findLayers(), 800);
            } else if (value.length === 0) {
                this.clearLayerList();
            }
        });
        
        // Document change listener
        app.eventNotifier.addListener('activeDocumentChanged', () => {
            this.checkDocument();
        });
    }
    
    async checkDocument() {
        try {
            const hasDoc = app.documents.length > 0;
            const statusDot = this.elements.statusIndicator.querySelector('.status-dot');
            
            if (hasDoc) {
                const doc = app.activeDocument;
                this.elements.statusText.textContent = `Ready - ${doc.name}`;
                statusDot.className = 'status-dot ready';
                this.enableControls(true);
            } else {
                this.elements.statusText.textContent = 'No document open';
                statusDot.className = 'status-dot error';
                this.enableControls(false);
                this.log('No document open in Photoshop', 'warning');
            }
        } catch (error) {
            this.elements.statusText.textContent = 'Error checking document';
            this.log('Error checking document: ' + error.message, 'error');
            this.enableControls(false);
        }
    }
    
    enableControls(enable) {
        this.elements.findLayers.disabled = !enable;
        this.elements.layerName.disabled = !enable;
        
        if (!enable) {
            this.elements.exportSelected.disabled = true;
            this.elements.exportAll.disabled = true;
            this.clearLayerList();
        }
    }
    
    async findLayers() {
        const layerName = this.elements.layerName.value.trim();
        if (!layerName) {
            this.log('Please enter a layer name to search', 'warning');
            return;
        }
        
        if (!app.activeDocument) {
            this.log('No active document', 'error');
            return;
        }
        
        try {
            this.log(`Searching for layers containing "${layerName}"...`, 'info');
            
            const exactMatch = this.elements.exactMatch.checked;
            this.foundLayers = await this.searchLayers(app.activeDocument, layerName, exactMatch);
            
            this.displayFoundLayers();
            
        } catch (error) {
            this.log('Error searching layers: ' + error.message, 'error');
            this.clearLayerList();
        }
    }
    
    async searchLayers(container, searchName, exactMatch, results = [], path = '') {
        const layers = container.layers;
        
        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            const layerPath = path ? `${path} > ${layer.name}` : layer.name;
            
            // Check for match
            const match = exactMatch ? 
                layer.name === searchName : 
                layer.name.toLowerCase().includes(searchName.toLowerCase());
            
            if (match) {
                results.push({
                    layer: layer,
                    name: layer.name,
                    path: layerPath,
                    type: layer.kind || layer.typename || 'Layer',
                    hasContent: await this.checkLayerHasContent(layer)
                });
            }
            
            // Search in layer groups
            if (layer.kind === 'group' || (layer.layers && layer.layers.length > 0)) {
                await this.searchLayers(layer, searchName, exactMatch, results, layerPath);
            }
        }
        
        return results;
    }
    
    async checkLayerHasContent(layer) {
        try {
            // For UXP, we'll assume layers have content unless we can prove otherwise
            return layer.visible !== false;
        } catch {
            return false;
        }
    }
    
    displayFoundLayers() {
        this.elements.layerList.innerHTML = '';
        this.elements.layerCount.textContent = this.foundLayers.length;
        
        if (this.foundLayers.length === 0) {
            this.log('No matching layers found', 'warning');
            this.elements.selectionSection.style.display = 'none';
            this.elements.exportSelected.disabled = true;
            this.elements.exportAll.disabled = true;
            return;
        }
        
        this.log(`Found ${this.foundLayers.length} matching layer(s)`, 'success');
        this.elements.selectionSection.style.display = 'block';
        
        this.foundLayers.forEach((layerInfo, index) => {
            const layerItem = document.createElement('div');
            layerItem.className = 'layer-item';
            layerItem.dataset.index = index;
            
            layerItem.innerHTML = `
                <div class="layer-path">${layerInfo.path}</div>
                <div class="layer-type">${layerInfo.type}${layerInfo.hasContent ? '' : ' (may be empty)'}</div>
            `;
            
            layerItem.addEventListener('click', () => this.selectLayer(index));
            this.elements.layerList.appendChild(layerItem);
        });
        
        // Auto-select first layer
        this.selectLayer(0);
        
        // Enable export all button if we have export path
        this.elements.exportAll.disabled = !this.exportFolder;
    }
    
    selectLayer(index) {
        // Remove previous selection
        const prevSelected = this.elements.layerList.querySelector('.selected');
        if (prevSelected) {
            prevSelected.classList.remove('selected');
        }
        
        // Select new layer
        const layerItem = this.elements.layerList.children[index];
        if (layerItem) {
            layerItem.classList.add('selected');
            
            this.selectedLayer = this.foundLayers[index];
            this.elements.exportSelected.disabled = !this.exportFolder;
            
            this.log(`Selected layer: ${this.selectedLayer.path}`, 'info');
        }
    }
    
    async browseExportPath() {
        try {
            const folder = await fs.getFolder();
            if (folder) {
                this.exportFolder = folder;
                this.elements.exportPath.value = folder.name;
                
                // Enable export buttons if layers are selected
                if (this.selectedLayer) {
                    this.elements.exportSelected.disabled = false;
                }
                if (this.foundLayers.length > 0) {
                    this.elements.exportAll.disabled = false;
                }
                
                this.log(`Export folder set: ${folder.name}`, 'success');
            }
        } catch (error) {
            this.log('Error selecting export folder: ' + error.message, 'error');
        }
    }
    
    clearLayerList() {
        this.elements.layerList.innerHTML = '';
        this.elements.layerCount.textContent = '0';
        this.elements.selectionSection.style.display = 'none';
        this.elements.exportSelected.disabled = true;
        this.elements.exportAll.disabled = true;
        this.foundLayers = [];
        this.selectedLayer = null;
    }
    
    async exportSelectedLayer() {
        if (!this.selectedLayer || !this.exportFolder) {
            this.log('Please select a layer and export folder', 'warning');
            return;
        }
        
        await this.exportLayers([this.selectedLayer]);
    }
    
    async exportAllLayers() {
        if (this.foundLayers.length === 0 || !this.exportFolder) {
            this.log('Please find layers and set export folder', 'warning');
            return;
        }
        
        await this.exportLayers(this.foundLayers);
    }
    
    async exportLayers(layersToExport) {
        if (layersToExport.length === 0 || this.isExporting) return;
        
        this.isExporting = true;
        this.cancelRequested = false;
        this.showProgress(true);
        
        const options = {
            prefix: this.elements.filePrefix.value.trim(),
            compression: parseInt(this.elements.compressionLevel.value),
            trimTransparent: this.elements.trimTransparent.checked,
            showInFinder: this.elements.showInFinder.checked
        };
        
        this.log(`Starting export of ${layersToExport.length} layer(s)...`, 'info');
        
        let exported = 0;
        let errors = 0;
        
        try {
            for (let i = 0; i < layersToExport.length && !this.cancelRequested; i++) {
                const layerInfo = layersToExport[i];
                const progress = ((i + 1) / layersToExport.length) * 100;
                
                this.updateProgress(
                    progress, 
                    `Exporting: ${layerInfo.name}`,
                    `${i + 1}/${layersToExport.length}`
                );
                
                try {
                    await this.exportSingleLayer(layerInfo, options);
                    exported++;
                    this.log(`✓ Exported: ${layerInfo.name}`, 'success');
                } catch (error) {
                    errors++;
                    this.log(`✗ Failed to export ${layerInfo.name}: ${error.message}`, 'error');
                }
                
                // Small delay to prevent UI freezing
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            if (this.cancelRequested) {
                this.log(`Export cancelled. ${exported} layers exported before cancellation.`, 'warning');
            } else {
                this.log(`Export completed! ${exported} layers exported successfully.${errors > 0 ? ` ${errors} errors.` : ''}`, 'success');
                
                // Show in finder if requested
                if (options.showInFinder && exported > 0) {
                    try {
                        await shell.openPath(this.exportFolder.nativePath);
                    } catch (e) {
                        this.log('Could not open export folder', 'warning');
                    }
                }
            }
            
        } catch (error) {
            this.log('Export process failed: ' + error.message, 'error');
        } finally {
            this.showProgress(false);
            this.isExporting = false;
        }
    }
    
    async exportSingleLayer(layerInfo, options) {
        const doc = app.activeDocument;
        
        // Save current state
        const currentActiveLayer = doc.activeLayer;
        const suspendHistory = await core.executeAsModal(async () => {
            try {
                // Hide all layers first
                await this.hideAllLayers(doc);
                
                // Show target layer and its parents
                await this.showLayerAndParents(layerInfo.layer);
                
                // Set as active layer
                doc.activeLayer = layerInfo.layer;
                
                // Generate filename
                const cleanName = layerInfo.name.replace(/[<>:"/\\|?*]/g, '_');
                const fileName = `${options.prefix}${cleanName}.png`;
                
                // Create duplicate document for export
                const exportDoc = await doc.duplicate();
                
                try {
                    // Trim transparent pixels if requested
                    if (options.trimTransparent) {
                        await action.batchPlay([{
                            _obj: "trim",
                            _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
                            trimBasedOn: { _enum: "trimBasedOn", _value: "transparency" },
                            top: true,
                            bottom: true,
                            left: true,
                            right: true
                        }], {});
                    }
                    
                    // Save as PNG
                    const exportFile = await this.exportFolder.createFile(fileName, { overwrite: true });
                    
                    await exportDoc.saveAs.png(exportFile, {
                        compression: options.compression,
                        interlaced: false
                    });
                    
                    return true;
                    
                } finally {
                    await exportDoc.close();
                }
                
            } finally {
                // Restore all layer visibility
                await this.restoreAllLayers(doc);
                doc.activeLayer = currentActiveLayer;
            }
        }, { commandName: 'Export Layer as PNG' });
        
        return suspendHistory;
    }
    
    async hideAllLayers(container) {
        const layers = container.layers;
        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            layer.visible = false;
            
            if (layer.kind === 'group' && layer.layers) {
                await this.hideAllLayers(layer);
            }
        }
    }
    
    async showLayerAndParents(layer) {
        layer.visible = true;
        
        // Show parent groups
        let parent = layer.parent;
        while (parent && parent.layers) {
            parent.visible = true;
            parent = parent.parent;
        }
    }
    
    async restoreAllLayers(container) {
        // This is a simplified restore - in a production version, 
        // you'd want to save the original visibility states
        const layers = container.layers;
        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            layer.visible = true;
            
            if (layer.kind === 'group' && layer.layers) {
                await this.restoreAllLayers(layer);
            }
        }
    }
    
    cancelExport() {
        this.cancelRequested = true;
        this.log('Export cancellation requested...', 'warning');
    }
    
    showProgress(show) {
        this.elements.progressSection.style.display = show ? 'block' : 'none';
        if (!show) {
            this.updateProgress(0, '', '0%');
        }
    }
    
    updateProgress(percent, text, label) {
        this.elements.progressFill.style.width = percent + '%';
        this.elements.progressText.textContent = text;
        this.elements.progressPercent.textContent = Math.round(percent) + '%';
        if (label) {
            this.elements.progressLabel.textContent = label;
        }
    }
    
    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        this.elements.statusLog.appendChild(logEntry);
        this.elements.statusLog.scrollTop = this.elements.statusLog.scrollHeight;
        
        // Keep only last 100 entries for performance
        while (this.elements.statusLog.children.length > 100) {
            this.elements.statusLog.removeChild(this.elements.statusLog.firstChild);
        }
    }
    
    clearLog() {
        this.elements.statusLog.innerHTML = '';
        this.log('Log cleared', 'info');
    }
}

// Initialize plugin when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new LayerExportPlugin();
    });
} else {
    new LayerExportPlugin();
}