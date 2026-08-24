/*
Caja de Texto UI v1.0
After Effects 24.0+ (usa app.fonts)
Instalar en Scripts/ScriptUI Panels y abrir desde Ventana.
*/
(function cajaTextoUI(thisObj) {
    var SCRIPT_NAME = "T13 Panel de Control";
    var textColor = [1, 1, 1];
    var boxColor = [236/255, 86/255, 0];
    var families = [];
    var familyFonts = {};

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function num(field, fallback) {
        var v = parseFloat(field.text);
        return isNaN(v) ? fallback : v;
    }
    function colorFromPicker(rgb) {
        return [((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255];
    }
    function colorToHex(c) {
        function h(v) { var s = Math.round(clamp(v,0,1)*255).toString(16).toUpperCase(); return s.length < 2 ? "0"+s : s; }
        return "#" + h(c[0]) + h(c[1]) + h(c[2]);
    }
    function esc(s) { return s.replace(/\\/g, "\\\\").replace(/\"/g, '\\"'); }
    function hexToColor(hex) {
        var h = hex.replace("#", "");
        return [parseInt(h.substr(0,2),16)/255, parseInt(h.substr(2,2),16)/255, parseInt(h.substr(4,2),16)/255];
    }

    function makePaletteButton(parent, hex, onPick) {
        var color = hexToColor(hex);
        var b = parent.add("button", undefined, "");
        b.preferredSize = [15, 15];
        b.minimumSize = [15, 15];
        b.maximumSize = [15, 15];
        b.helpTip = hex;
        b.onDraw = function() {
            var g = this.graphics;
            g.newPath();
            g.rectPath(1, 1, this.size.width - 2, this.size.height - 2);
            g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, color));
            g.strokePath(g.newPen(g.PenType.SOLID_COLOR, [0.55,0.55,0.55], 1));
        };
        b.onClick = function() { onPick([color[0], color[1], color[2]], hex); };
        return b;
    }


    function makeColorSwatch(parent, colorGetter) {
        var swatch = parent.add("panel", undefined, "");
        swatch.preferredSize = [30, 22];
        swatch.minimumSize = [30, 22];
        swatch.maximumSize = [30, 22];
        swatch.onDraw = function() {
            var g = this.graphics;
            var c = colorGetter();
            g.newPath();
            g.rectPath(0, 0, this.size.width, this.size.height);
            g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, c));
            g.newPath();
            g.rectPath(0.5, 0.5, this.size.width - 1, this.size.height - 1);
            g.strokePath(g.newPen(g.PenType.SOLID_COLOR, [0.55, 0.55, 0.55], 1));
        };
        return swatch;
    }

    function loadFonts() {
        if (!app.fonts || !app.fonts.allFonts) return;
        var groups = app.fonts.allFonts;
        for (var i = 0; i < groups.length; i++) {
            if (!groups[i] || !groups[i].length) continue;
            try {
                var family = groups[i][0].familyName;
                if (!family || family === "") continue;
                if (!familyFonts[family]) {
                    families.push(family);
                    familyFonts[family] = [];
                }
                for (var j = 0; j < groups[i].length; j++) {
                    try { familyFonts[family].push(groups[i][j]); } catch (fontErr) {}
                }
            } catch (groupErr) {}
        }
        families.sort();
    }


    function uniqueLayerName(comp, base) {
        var n = 1;
        var candidate = base + " 01";
        var exists;
        do {
            exists = false;
            candidate = base + " " + (n < 10 ? "0" : "") + n;
            for (var i = 1; i <= comp.numLayers; i++) {
                if (comp.layer(i).name === candidate) { exists = true; break; }
            }
            n++;
        } while (exists);
        return candidate;
    }

    function addSlider(layer, name, value) {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        fx.name = name;
        fx.property(1).setValue(value);
        return fx;
    }

    function selectedFont(familyDD, styleDD) {
        if (!familyDD.selection) return null;
        var list = familyFonts[familyDD.selection.text];
        if (!list || !list.length) return null;
        var idx = styleDD.selection ? styleDD.selection.index : 0;
        return list[Math.min(idx, list.length - 1)];
    }

    function selectedRealignLayers(comp) {
        var result = [];
        if (!comp) return result;
        for (var i = 0; i < comp.selectedLayers.length; i++) {
            var layer = comp.selectedLayers[i];
            if (layer instanceof TextLayer) result.push(layer);
        }
        return result;
    }

    function pointInCompFromSource(layer, point) {
        var tr = layer.property("ADBE Transform Group");
        var anchor = tr.property("ADBE Anchor Point").value;
        var scale = tr.property("ADBE Scale").value;
        var rotation = tr.property("ADBE Rotate Z").value * Math.PI / 180;
        var position = tr.property("ADBE Position").value;
        var x = (point[0] - anchor[0]) * scale[0] / 100;
        var y = (point[1] - anchor[1]) * scale[1] / 100;
        var rx = x * Math.cos(rotation) - y * Math.sin(rotation);
        var ry = x * Math.sin(rotation) + y * Math.cos(rotation);
        return [position[0] + rx, position[1] + ry];
    }

    function layerVisualCenter(layer) {
        var r = layer.sourceRectAtTime(layer.containingComp.time, false);
        return pointInCompFromSource(layer, [r.left + r.width / 2, r.top + r.height / 2]);
    }

    function linkedBoxForText(layer) {
        var comp = layer.containingComp;
        var wanted = "Caja - " + layer.name;
        for (var i = 1; i <= comp.numLayers; i++) {
            var candidate = comp.layer(i);
            if (candidate instanceof ShapeLayer && candidate.name === wanted) return candidate;
        }
        return null;
    }

    function compDeltaToLocalPosition(layer, dx, dy) {
        if (!layer.parent) return [dx, dy];
        var pt = layer.parent.property("ADBE Transform Group");
        var scale = pt.property("ADBE Scale").value;
        var rotation = -pt.property("ADBE Rotate Z").value * Math.PI / 180;
        var x = dx * Math.cos(rotation) - dy * Math.sin(rotation);
        var y = dx * Math.sin(rotation) + dy * Math.cos(rotation);
        return [x / (scale[0] / 100), y / (scale[1] / 100)];
    }

    function shiftLayerPosition(layer, dx, dy) {
        var posProp = layer.property("ADBE Transform Group").property("ADBE Position");
        if (posProp.expressionEnabled) throw new Error("La posición de " + layer.name + " tiene una expresión.");
        var d = compDeltaToLocalPosition(layer, dx, dy);
        function shifted(v) {
            if (v.length > 2) return [v[0] + d[0], v[1] + d[1], v[2]];
            return [v[0] + d[0], v[1] + d[1]];
        }
        if (posProp.numKeys > 0) {
            for (var k = 1; k <= posProp.numKeys; k++) posProp.setValueAtKey(k, shifted(posProp.keyValue(k)));
        } else {
            posProp.setValue(shifted(posProp.value));
        }
    }

    function setTextJustificationKeepPlace(layer, justification) {
        var source = layer.property("ADBE Text Properties").property("ADBE Text Document");
        if (source.expressionEnabled) throw new Error("El texto de " + layer.name + " usa una expresión.");
        var linkedBox = linkedBoxForText(layer);
        var textBefore = layerVisualCenter(layer);
        var boxBefore = linkedBox ? layerVisualCenter(linkedBox) : null;
        var doc = source.value;
        doc.justification = justification;
        source.setValue(doc);
        var textAfter = layerVisualCenter(layer);
        shiftLayerPosition(layer, textBefore[0] - textAfter[0], textBefore[1] - textAfter[1]);
        if (linkedBox && boxBefore) {
            var boxAfter = layerVisualCenter(linkedBox);
            shiftLayerPosition(linkedBox, boxBefore[0] - boxAfter[0], boxBefore[1] - boxAfter[1]);
        }
    }

    function transformPointThroughLayer(layer, point, time) {
        var tr = layer.property("ADBE Transform Group");
        var anchor = tr.property("ADBE Anchor Point").valueAtTime(time, false);
        var scale = tr.property("ADBE Scale").valueAtTime(time, false);
        var rotation = tr.property("ADBE Rotate Z").valueAtTime(time, false) * Math.PI / 180;
        var position = tr.property("ADBE Position").valueAtTime(time, false);
        var x = (point[0] - anchor[0]) * scale[0] / 100;
        var y = (point[1] - anchor[1]) * scale[1] / 100;
        var transformed = [
            position[0] + x * Math.cos(rotation) - y * Math.sin(rotation),
            position[1] + x * Math.sin(rotation) + y * Math.cos(rotation)
        ];
        if (layer.parent) return transformPointThroughLayer(layer.parent, transformed, time);
        return transformed;
    }

    function layerBoundsInComp(layer, time) {
        var r = layer.sourceRectAtTime(time, false);
        var points = [
            [r.left, r.top],
            [r.left + r.width, r.top],
            [r.left, r.top + r.height],
            [r.left + r.width, r.top + r.height]
        ];
        var left = 99999999, top = 99999999, right = -99999999, bottom = -99999999;
        for (var i = 0; i < points.length; i++) {
            var p = transformPointThroughLayer(layer, points[i], time);
            left = Math.min(left, p[0]);
            top = Math.min(top, p[1]);
            right = Math.max(right, p[0]);
            bottom = Math.max(bottom, p[1]);
        }
        return {left:left, top:top, right:right, bottom:bottom};
    }

    function precomposeLayers(comp, layers, name) {
        var indices = [];
        var bounds = null;
        var time = comp.time;
        for (var ti = 0; ti < layers.length; ti++) {
            if (!layers[ti]) continue;
            var apertureFx = layers[ti].property("ADBE Effect Parade") ? layers[ti].property("ADBE Effect Parade").property("Apertura caja") : null;
            if (apertureFx && apertureFx.property(1).numKeys > 0) {
                time = Math.max(time, apertureFx.property(1).keyTime(apertureFx.property(1).numKeys));
            }
        }
        var included = [];

        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (!layer) continue;
            indices.push(layer.index);
            included.push(layer);

            // El nulo controlador se incluye en la precomp, pero no define su tamaño.
            if (layer.nullLayer) continue;
            var b = layerBoundsInComp(layer, time);
            if (!bounds) {
                bounds = {left:b.left, top:b.top, right:b.right, bottom:b.bottom};
            } else {
                bounds.left = Math.min(bounds.left, b.left);
                bounds.top = Math.min(bounds.top, b.top);
                bounds.right = Math.max(bounds.right, b.right);
                bounds.bottom = Math.max(bounds.bottom, b.bottom);
            }
        }

        indices.sort(function(a, b) { return a - b; });
        if (!indices.length || !bounds) return null;

        if (!isFinite(bounds.left) || !isFinite(bounds.top) || !isFinite(bounds.right) || !isFinite(bounds.bottom)) {
            throw new Error("No se pudieron calcular los límites de la precomposición.");
        }

        // Margen de 10 px por cada lado.
        var pad = 10;
        bounds.left = Math.floor(bounds.left) - pad;
        bounds.top = Math.floor(bounds.top) - pad;
        bounds.right = Math.ceil(bounds.right) + pad;
        bounds.bottom = Math.ceil(bounds.bottom) + pad;
        var newWidth = Math.max(4, Math.min(30000, Math.round(bounds.right - bounds.left)));
        var newHeight = Math.max(4, Math.min(30000, Math.round(bounds.bottom - bounds.top)));

        var nestedComp = comp.layers.precompose(indices, name, true);
        var precompLayer = null;
        for (var li = 1; li <= comp.numLayers; li++) {
            if (comp.layer(li).source === nestedComp) { precompLayer = comp.layer(li); break; }
        }
        if (!precompLayer) return nestedComp;

        nestedComp.width = newWidth;
        nestedComp.height = newHeight;

        function offsetPositionProperty(pos, dx, dy) {
            if (!pos || pos.expressionEnabled) return;
            function shifted(v) {
                if (v.length > 2) return [v[0] + dx, v[1] + dy, v[2]];
                return [v[0] + dx, v[1] + dy];
            }
            if (pos.numKeys > 0) {
                for (var k = 1; k <= pos.numKeys; k++) {
                    pos.setValueAtKey(k, shifted(pos.keyValue(k)));
                }
            } else {
                pos.setValue(shifted(pos.value));
            }
        }

        // Desplazar solo capas raíz. Las capas parentadas siguen al nulo y no se duplican offsets.
        for (var ni = 1; ni <= nestedComp.numLayers; ni++) {
            var inner = nestedComp.layer(ni);
            if (inner.parent) continue;
            var pos = inner.property("ADBE Transform Group").property("ADBE Position");
            offsetPositionProperty(pos, -bounds.left, -bounds.top);
        }

        var outerTransform = precompLayer.property("ADBE Transform Group");
        outerTransform.property("ADBE Anchor Point").setValue([newWidth / 2, newHeight / 2]);
        outerTransform.property("ADBE Position").setValue([(bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2]);
        precompLayer.selected = true;
        return nestedComp;
    }

    function applyTextColorToSelection(color) {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) return 0;
        var changed = 0;
        for (var i = 0; i < comp.selectedLayers.length; i++) {
            var layer = comp.selectedLayers[i];
            if (!(layer instanceof TextLayer)) continue;
            var source = layer.property("ADBE Text Properties").property("ADBE Text Document");
            var doc = source.value;
            doc.applyFill = true;
            doc.fillColor = color;
            source.setValue(doc);
            changed++;
        }
        return changed;
    }

    function applyBoxColorToSelection(color) {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) return 0;
        var changed = 0;
        for (var i = 0; i < comp.selectedLayers.length; i++) {
            var layer = comp.selectedLayers[i];
            if (!(layer instanceof ShapeLayer)) continue;
            var root = layer.property("ADBE Root Vectors Group");
            if (!root) continue;
            for (var gi = 1; gi <= root.numProperties; gi++) {
                var group = root.property(gi);
                if (!group || group.matchName !== "ADBE Vector Group") continue;
                var contents = group.property("ADBE Vectors Group");
                if (!contents) continue;
                for (var pi = 1; pi <= contents.numProperties; pi++) {
                    var item = contents.property(pi);
                    if (item && item.matchName === "ADBE Vector Graphic - Fill") {
                        item.property("ADBE Vector Fill Color").setValue(color);
                        changed++;
                    }
                }
            }
        }
        return changed;
    }

    function applyBoxSliderToSelection(effectName, value) {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) return 0;
        var changed = 0;
        for (var i = 0; i < comp.selectedLayers.length; i++) {
            var layer = comp.selectedLayers[i];
            var effects = layer.property("ADBE Effect Parade");
            if (!effects) continue;
            var fx = effects.property(effectName);
            if (!fx) continue;
            var slider = fx.property(1);
            if (!slider) continue;
            slider.setValue(value);
            changed++;
        }
        return changed;
    }

    function updateSelectedTextDocument(mutator) {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) return 0;
        var changed = 0;
        for (var i = 0; i < comp.selectedLayers.length; i++) {
            var layer = comp.selectedLayers[i];
            if (!(layer instanceof TextLayer)) continue;
            var source = layer.property("ADBE Text Properties").property("ADBE Text Document");
            try {
                var doc = source.value;
                mutator(doc, layer);
                source.setValue(doc);
                changed++;
            } catch (err) {}
        }
        return changed;
    }

    function applySelectedTextContent(value) {
        return updateSelectedTextDocument(function(doc, layer) {
            var source = layer.property("ADBE Text Properties").property("ADBE Text Document");
            if (!source.expressionEnabled) doc.text = value;
        });
    }

    function makeAlignIconButton(parent, mode, tooltip, size) {
        var b = parent.add("button", undefined, "");
        var sz = size || [34, 28];
        b.preferredSize = sz; b.minimumSize = sz; b.maximumSize = sz;
        b.helpTip = tooltip;
        b.active = false;
        b.onDraw = function() {
            var g=this.graphics, w=this.size.width, h=this.size.height;
            if (this.active) {
                g.newPath();
                g.rectPath(0.5, 0.5, w - 1, h - 1);
                g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [0.20, 0.72, 0.92]));
                g.strokePath(g.newPen(g.PenType.SOLID_COLOR, [0.35, 0.88, 1.0], 1));
            }
            var fg=this.active?[0.05,0.12,0.16]:[0.72,0.72,0.72], pen=g.newPen(g.PenType.SOLID_COLOR,fg,2);
            if (mode === "centerH" || mode === "centerV" || mode === "centerBoth") {
                if (mode !== "centerV") { g.newPath(); g.moveTo(w/2,5); g.lineTo(w/2,h-5); g.strokePath(pen); }
                if (mode !== "centerH") { g.newPath(); g.moveTo(6,h/2); g.lineTo(w-6,h/2); g.strokePath(pen); }
                g.newPath(); g.rectPath(w/2-5,h/2-4,10,8); g.strokePath(pen); return;
            }
            var widths=[18,13,20,15];
            for(var i=0;i<widths.length;i++){
                var lw=widths[i], x=mode==="left"?7:(mode==="right"?w-7-lw:(w-lw)/2), y=7+i*4;
                g.newPath(); g.moveTo(x,y); g.lineTo(x+lw,y); g.strokePath(pen);
            }
        };
        return b;
    }

    function addYellowBorder(panel) {
        // Avoid overriding onDraw because that can hide ScriptUI child controls.
        try {
            panel.graphics.foregroundColor = panel.graphics.newPen(
                panel.graphics.PenType.SOLID_COLOR,
                [1.0, 0.78, 0.05],
                1
            );
        } catch (borderErr) {}
    }

    function styleActionButton(button, backgroundColor, textColor) {
        button.preferredSize.height = 30;
        button.onDraw = function() {
            var g = this.graphics;
            var bg = g.newBrush(g.BrushType.SOLID_COLOR, backgroundColor);
            var border = g.newPen(g.PenType.SOLID_COLOR, [0.45, 0.24, 0.02], 1);
            var textPen = g.newPen(g.PenType.SOLID_COLOR, textColor, 1);
            g.newPath();
            g.rectPath(0.5, 0.5, this.size.width - 1, this.size.height - 1);
            g.fillPath(bg);
            g.strokePath(border);
            var labelSize = g.measureString(this.text, g.font);
            g.drawString(this.text, textPen, (this.size.width - labelSize[0]) / 2, (this.size.height - labelSize[1]) / 2, g.font);
        };
    }

    function createAnimationController(comp, layers, name, position) {
        var controller = comp.layers.addNull();
        controller.name = uniqueLayerName(comp, name + " - Control");
        controller.property("ADBE Transform Group").property("ADBE Position").setValue(position);
        for (var i = 0; i < layers.length; i++) if (layers[i]) layers[i].parent = controller;
        controller.moveToBeginning();
        controller.selected = true;
        return controller;
    }

    function easeAnimatedProperty(prop) {
        try {
            for (var i = 1; i <= prop.numKeys; i++) {
                prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
                var count = prop.keyInTemporalEase(i).length, a = [], b = [];
                for (var j = 0; j < count; j++) { a.push(new KeyframeEase(0, 75)); b.push(new KeyframeEase(0, 75)); }
                prop.setTemporalEaseAtKey(i, a, b);
            }
        } catch (e) {}
    }

    function animateBoxAndText(comp, textLayer, shapeLayer, duration, entry, exit, topMargin, bottomMargin) {
        if (!entry && !exit) return null;
        if (!textLayer.setTrackMatte) throw new Error("Esta animación requiere After Effects 23 o superior.");
        textLayer.setTrackMatte(shapeLayer, TrackMatteType.ALPHA);
        shapeLayer.enabled = true;
        var textTransform = textLayer.property("ADBE Transform Group");
        var finalPosition = textTransform.property("ADBE Position").value;
        var shapePosition = shapeLayer.property("ADBE Transform Group").property("ADBE Position");
        shapePosition.expression = "";
        shapePosition.setValue(finalPosition);
        var controller = createAnimationController(comp, [shapeLayer, textLayer], textLayer.name, finalPosition);
        textTransform.property("ADBE Position").setValue([0,0]);
        shapePosition.setValue([0,0]);
        var p = textTransform.property("ADBE Position");
        var aperture = shapeLayer.property("ADBE Effect Parade").property("Apertura caja").property(1);
        var h = textLayer.sourceRectAtTime(comp.time,false).height + topMargin + bottomMargin;
        var hidden = [0,h], visible = [0,0];
        var d = Math.max(comp.frameDuration*5,duration), t0=comp.time, t1=t0+d;
        if (entry) {
            aperture.setValueAtTime(t0,0); aperture.setValueAtTime(t1,100);
            p.setValueAtTime(t0+d*0.5,hidden); p.setValueAtTime(t1,visible);
        } else aperture.setValueAtTime(t0,100);
        if (exit) {
            var outEnd=Math.min(comp.duration,Math.max(t1+d,textLayer.outPoint));
            var outStart=Math.max(t1,outEnd-d);
            aperture.setValueAtTime(outStart,100); aperture.setValueAtTime(outEnd,0);
            p.setValueAtTime(outStart,visible); p.setValueAtTime(outStart+d*0.5,hidden);
        }
        easeAnimatedProperty(aperture); easeAnimatedProperty(p);
        return controller;
    }

    function createScrollableTab(tab) {
        var shell = tab.add("group");
        shell.orientation = "row";
        shell.alignment = ["fill", "fill"];
        shell.alignChildren = ["fill", "fill"];
        shell.spacing = 3;

        var viewport = shell.add("panel", undefined, "");
        viewport.alignment = ["fill", "fill"];
        viewport.margins = 0;
        viewport.minimumSize = [270, 260];
        viewport.preferredSize.width = 286;

        var content = viewport.add("group");
        content.orientation = "column";
        content.alignChildren = ["fill", "top"];
        content.alignment = ["fill", "top"];
        content.spacing = 6;
        content.margins = [6, 4, 26, 4];

        var bar = shell.add("scrollbar", undefined, 0, 0, 100);
        bar.alignment = ["right", "fill"];
        bar.preferredSize.width = 5;
        bar.minimumSize.width = 5;
        bar.maximumSize.width = 5;
        bar.stepdelta = 25;
        bar.jumpdelta = 120;

        return {shell:shell, viewport:viewport, content:content, bar:bar, baseY:0, contentHeight:0};
    }

    function measureScrollContent(scrollData) {
        var content = scrollData.content;
        var bottom = 0;
        for (var i = 0; i < content.children.length; i++) {
            var child = content.children[i];
            bottom = Math.max(bottom, child.location.y + child.size.height);
        }
        return Math.max(bottom + 8, 1);
    }

    function updateTabScroll(scrollData, relayout) {
        if (!scrollData || !scrollData.viewport || !scrollData.content) return;
        if (relayout) {
            scrollData.viewport.layout.layout(true);
            scrollData.content.layout.layout(true);
        }
        var viewportHeight = Math.max(1, scrollData.viewport.size.height - 2);
        var contentHeight = measureScrollContent(scrollData);
        scrollData.contentHeight = contentHeight;
        scrollData.content.minimumSize.height = contentHeight;
        scrollData.content.preferredSize.height = contentHeight;
        scrollData.content.maximumSize.height = contentHeight;
        scrollData.bar.minvalue = 0;
        scrollData.bar.maxvalue = Math.max(0, contentHeight - viewportHeight);
        scrollData.bar.enabled = scrollData.bar.maxvalue > 0;
        if (scrollData.bar.value > scrollData.bar.maxvalue) scrollData.bar.value = scrollData.bar.maxvalue;
        scrollData.content.location = [0, -Math.round(scrollData.bar.value)];
    }

    function scrollTabBy(scrollData, delta) {
        if (!scrollData || !scrollData.bar.enabled) return;
        scrollData.bar.value = Math.max(0, Math.min(scrollData.bar.maxvalue, scrollData.bar.value + delta));
        scrollData.content.location = [0, -Math.round(scrollData.bar.value)];
    }

    function buildUI(thisObj) {
        var w = (thisObj instanceof Panel) ? thisObj : new Window("palette", SCRIPT_NAME, undefined, {resizeable:true});
        var updateAllBtn;
        w.maximumSize.width = 375;
        w.minimumSize.width = 375;
        w.preferredSize.width = 375;
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        w.spacing = 8;
        w.margins = 8;

        var mainTabs = w.add("tabbedpanel");
        mainTabs.alignment = ["fill", "fill"];
        mainTabs.alignChildren = ["fill", "top"];
        mainTabs.preferredSize = [359, 650];
        var textTab = mainTabs.add("tab", undefined, "Texto + Caja");
        var dateTab = mainTabs.add("tab", undefined, "Fecha");
        var timerTab = mainTabs.add("tab", undefined, "Timer");
        textTab.orientation = dateTab.orientation = timerTab.orientation = "column";
        textTab.alignChildren = dateTab.alignChildren = timerTab.alignChildren = ["fill", "top"];
        textTab.spacing = dateTab.spacing = timerTab.spacing = 6;
        textTab.margins = dateTab.margins = timerTab.margins = 6;
        mainTabs.selection = textTab;
        var textScroll = createScrollableTab(textTab);
        var dateScroll = createScrollableTab(dateTab);
        var timerScroll = createScrollableTab(timerTab);

        var textPanel = textScroll.content.add("panel", undefined, "Texto");
        textPanel.orientation = "column";
        textPanel.alignChildren = ["fill", "top"];
        textPanel.margins = 10;
        var textInput = textPanel.add("edittext", undefined, "Escribe tu texto", {multiline:true, scrolling:true});
        textInput.preferredSize.height = 60;

        var fontRow = textPanel.add("group");
        fontRow.alignment = ["fill", "top"];
        fontRow.add("statictext", undefined, "Tipografía");
        var familyDD = fontRow.add("dropdownlist", undefined, families);
        familyDD.preferredSize.width = 185;

        var styleRow = textPanel.add("group");
        styleRow.alignment = ["fill", "top"];
        styleRow.add("statictext", undefined, "Estilo");
        var styleDD = styleRow.add("dropdownlist", undefined, []);
        styleDD.preferredSize.width = 125;
        styleRow.add("statictext", undefined, "Tamaño");
        var sizeInput = styleRow.add("edittext", undefined, "72");
        sizeInput.characters = 4;

        var textBottomRow = textPanel.add("group");
        textBottomRow.alignment = ["fill", "top"];
        textBottomRow.alignChildren = ["left", "top"];
        textBottomRow.spacing = 12;

        var colorTools = textBottomRow.add("group");
        colorTools.orientation = "column";
        colorTools.alignChildren = ["left", "top"];
        colorTools.spacing = 3;
        colorTools.add("statictext", undefined, "Color");
        var colorToolsRow = colorTools.add("group");
        var textColorSwatch = makeColorSwatch(colorToolsRow, function() { return textColor; });
        var textColorBtn = colorToolsRow.add("button", undefined, "Texto " + colorToHex(textColor));
        textColorBtn.preferredSize.width = 105;

        var alignmentTools = textBottomRow.add("group");
        alignmentTools.orientation = "column";
        alignmentTools.alignChildren = ["left", "top"];
        alignmentTools.spacing = 3;
        alignmentTools.add("statictext", undefined, "Alineación");
        var justifyRow = alignmentTools.add("group");
        justifyRow.spacing = 1;
        var alignLeftBtn = makeAlignIconButton(justifyRow, "left", "Alinear texto a la izquierda", [28,26]);
        var alignCenterBtn = makeAlignIconButton(justifyRow, "center", "Centrar texto", [28,26]);
        var alignRightBtn = makeAlignIconButton(justifyRow, "right", "Alinear texto a la derecha", [28,26]);

        var boxPanel = textScroll.content.add("panel", undefined, "Caja");
        boxPanel.orientation = "column";
        boxPanel.alignChildren = ["fill", "top"];
        boxPanel.margins = 10;
        addYellowBorder(boxPanel);

        var boxControls = boxPanel.add("group");
        boxControls.orientation = "column";
        boxControls.alignChildren = ["left", "center"];
        boxControls.alignment = ["left", "top"];
        boxControls.spacing = 7;

        var roundRow = boxControls.add("group");
        roundRow.alignment = ["left", "center"];
        var roundLabel = roundRow.add("statictext", undefined, "Redondeo");
        roundLabel.preferredSize.width = 72;
        var roundSlider = roundRow.add("slider", undefined, 24, 0, 200);
        roundSlider.preferredSize.width = 115;
        var roundInput = roundRow.add("edittext", undefined, "24");
        roundInput.characters = 5;

        var marginRow = boxControls.add("group");
        marginRow.alignment = ["left", "center"];
        var marginLabel = marginRow.add("statictext", undefined, "Verticales");
        marginLabel.preferredSize.width = 72;
        marginRow.add("statictext", undefined, "Arriba");
        var topInput = marginRow.add("edittext", undefined, "24"); topInput.characters = 5;
        marginRow.add("statictext", undefined, "Abajo");
        var bottomInput = marginRow.add("edittext", undefined, "24"); bottomInput.characters = 5;

        var sideRow = boxControls.add("group");
        sideRow.alignment = ["left", "center"];
        var sideLabel = sideRow.add("statictext", undefined, "Laterales");
        sideLabel.preferredSize.width = 72;
        var sideSlider = sideRow.add("slider", undefined, 32, 0, 300);
        sideSlider.preferredSize.width = 115;
        var sideInput = sideRow.add("edittext", undefined, "32");
        sideInput.characters = 5;

        var boxColorRow = boxControls.add("group");
        boxColorRow.alignment = ["left", "center"];
        var colorLabel = boxColorRow.add("statictext", undefined, "Color de fondo");
        colorLabel.preferredSize.width = 72;
        var boxColorSwatch = makeColorSwatch(boxColorRow, function() { return boxColor; });
        var boxColorBtn = boxColorRow.add("button", undefined, "Elegir " + colorToHex(boxColor));

        var paletteColors = ["#EC5600", "#1E315D", "#167EFA", "#FF8200", "#E2E2E2", "#FFB800", "#FF1366", "#09122A", "#03ECFA", "#00B8A7"];

        function buildPalette(parent, title, onPick) {
            var panel = parent.add("panel", undefined, title);
            panel.orientation = "column";
            panel.alignChildren = ["fill", "top"];
            panel.margins = 10;
            var row1 = panel.add("group");
            var row2 = panel.add("group");
            for (var i = 0; i < paletteColors.length; i++) {
                makePaletteButton(i < 5 ? row1 : row2, paletteColors[i], onPick);
            }
            return panel;
        }

        var palettesRow = textScroll.content.add("group");
        palettesRow.orientation = "row";
        palettesRow.alignChildren = ["fill", "top"];
        palettesRow.alignment = ["fill", "top"];

        buildPalette(palettesRow, "Colores de texto", function(c, hex) {
            textColor = c;
            textColorBtn.text = "Texto " + hex;
            textColorSwatch.notify("onDraw");
            app.beginUndoGroup("Cambiar color de texto");
            try { applyTextColorToSelection(c); } finally { app.endUndoGroup(); }
        });

        buildPalette(palettesRow, "Colores de fondo", function(c, hex) {
            boxColor = c;
            boxColorBtn.text = "Elegir " + hex;
            boxColorSwatch.notify("onDraw");
            app.beginUndoGroup("Cambiar color de caja");
            try { applyBoxColorToSelection(c); } finally { app.endUndoGroup(); }
        });

        var textPrecomposeRow = textScroll.content.add("group");
        textPrecomposeRow.alignment = ["fill", "top"];
        var precompTextCheck = textPrecomposeRow.add("checkbox", undefined, "Precomponer");
        var textAnimationRow = textScroll.content.add("group");
        textAnimationRow.alignChildren = ["left", "center"];
        textAnimationRow.spacing = 8;
        var animateTextCheck = textAnimationRow.add("checkbox", undefined, "Entrada");
        var animateTextOutCheck = textAnimationRow.add("checkbox", undefined, "Salida");
        textAnimationRow.add("statictext", undefined, "Duración");
        var animationDurationInput = textAnimationRow.add("edittext", undefined, "0.6");
        animationDurationInput.characters = 4;
        var textCreateButtonRow = textScroll.content.add("group");
        textCreateButtonRow.alignment = ["fill", "top"];
        textCreateButtonRow.alignChildren = ["fill", "center"];
        var createBtn = textCreateButtonRow.add("button", undefined, "Crear texto + caja");
        createBtn.alignment = ["center", "center"];
        createBtn.preferredSize.width = 235;
        createBtn.maximumSize.width = 235;
        styleActionButton(createBtn, [0.93, 0.34, 0.0], [1, 1, 1]);

        var datePanel = dateScroll.content.add("panel", undefined, "Crear fecha");
        datePanel.orientation = "column";
        datePanel.alignChildren = ["fill", "top"];
        datePanel.margins = 10;
        var dateRow = datePanel.add("group");
        dateRow.add("statictext", undefined, "Día");
        var dayItems = [];
        for (var di = 1; di <= 31; di++) dayItems.push(di < 10 ? "0" + di : String(di));
        var dayDD = dateRow.add("dropdownlist", undefined, dayItems);
        dayDD.preferredSize.width = 55;
        dayDD.selection = 0;
        dateRow.add("statictext", undefined, "Mes");
        var monthDD = dateRow.add("dropdownlist", undefined, ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]);
        monthDD.preferredSize.width = 105;
        monthDD.selection = 0;
        var dateYearRow = datePanel.add("group");
        dateYearRow.add("statictext", undefined, "Año");
        var yearItems = [];
        for (var yi = 1950; yi <= 2030; yi++) yearItems.push(String(yi));
        var yearDD = dateYearRow.add("dropdownlist", undefined, yearItems);
        yearDD.preferredSize.width = 80;
        yearDD.selection = yearItems.length - 1;
        var dateOptionsRow = datePanel.add("group");
        var dateBoxCheck = dateOptionsRow.add("checkbox", undefined, "Agregar caja"); dateBoxCheck.value = true;
        var precompDateCheck = dateOptionsRow.add("checkbox", undefined, "Precomponer fecha");
        var dateAnimationRow = datePanel.add("group"); dateAnimationRow.spacing=8;
        var animateDateInCheck = dateAnimationRow.add("checkbox", undefined, "Entrada");
        var animateDateOutCheck = dateAnimationRow.add("checkbox", undefined, "Salida");
        dateAnimationRow.add("statictext", undefined, "Duración");
        var dateAnimationDurationInput = dateAnimationRow.add("edittext", undefined, "0.6"); dateAnimationDurationInput.characters=4;
        var createDateBtn = datePanel.add("button", undefined, "Crear fecha");
        styleActionButton(createDateBtn, [0.93, 0.34, 0.0], [1, 1, 1]);
        createDateBtn.alignment = ["center", "center"];
        createDateBtn.preferredSize.width = 235;
        createDateBtn.maximumSize.width = 235;

        var timerPanel = timerScroll.content.add("panel", undefined, "Timer / contador");
        timerPanel.orientation = "column";
        timerPanel.alignChildren = ["fill", "top"];
        timerPanel.margins = 10;
        addYellowBorder(timerPanel);

        var timerModeRow = timerPanel.add("group");
        timerModeRow.add("statictext", undefined, "Dirección");
        var timerModeDD = timerModeRow.add("dropdownlist", undefined, ["Ascendente", "Descendente"]);
        timerModeDD.selection = 0;

        var timerValuesRow = timerPanel.add("group");
        timerValuesRow.add("statictext", undefined, "Inicio");
        var timerStartInput = timerValuesRow.add("edittext", undefined, "0");
        timerStartInput.characters = 4;
        timerValuesRow.add("statictext", undefined, "Final");
        var timerEndInput = timerValuesRow.add("edittext", undefined, "60");
        timerEndInput.characters = 4;
        var timerDurationRow = timerPanel.add("group");
        timerDurationRow.add("statictext", undefined, "Duración");
        var timerDurationInput = timerDurationRow.add("edittext", undefined, "10");
        timerDurationInput.characters = 4;
        timerDurationRow.add("statictext", undefined, "segundos");

        var timerNumRow = timerPanel.add("group");
        timerNumRow.add("statictext", undefined, "Miles");
        var thousandDD = timerNumRow.add("dropdownlist", undefined, [",", ".", "espacio", "ninguno"]);
        thousandDD.preferredSize.width = 85;
        thousandDD.selection = 0;
        timerNumRow.add("statictext", undefined, "Decimal");
        var decimalDD = timerNumRow.add("dropdownlist", undefined, [".", ","]);
        decimalDD.preferredSize.width = 50;
        decimalDD.selection = 0;
        var decimalPlacesRow = timerPanel.add("group");
        decimalPlacesRow.add("statictext", undefined, "Decimales");
        var decimalPlacesInput = decimalPlacesRow.add("edittext", undefined, "0");
        decimalPlacesInput.characters = 3;

        var countRow = timerPanel.add("group");
        countRow.add("statictext", undefined, "Contar");
        var minutesCheck = countRow.add("checkbox", undefined, "Minutos");
        var secondsCheck = countRow.add("checkbox", undefined, "Segundos");
        var millisCheck = countRow.add("checkbox", undefined, "Milisegundos");
        minutesCheck.value = true;
        secondsCheck.value = true;
        millisCheck.value = true;

        var timerOptionsRow = timerPanel.add("group");
        var timerBoxCheck = timerOptionsRow.add("checkbox", undefined, "Agregar caja al timer");
        timerBoxCheck.value = false;
        var precompTimerCheck = timerOptionsRow.add("checkbox", undefined, "Precomponer timer");
        var timerAnimationRow = timerPanel.add("group"); timerAnimationRow.spacing=8;
        var animateTimerInCheck = timerAnimationRow.add("checkbox", undefined, "Entrada");
        var animateTimerOutCheck = timerAnimationRow.add("checkbox", undefined, "Salida");
        timerAnimationRow.add("statictext", undefined, "Duración");
        var timerAnimationDurationInput = timerAnimationRow.add("edittext", undefined, "0.6"); timerAnimationDurationInput.characters=4;

        var createTimerBtn = timerPanel.add("button", undefined, "Crear timer con keyframes");
        styleActionButton(createTimerBtn, [0.93, 0.34, 0.0], [1, 1, 1]);
        createTimerBtn.alignment = ["center", "center"];
        createTimerBtn.preferredSize.width = 235;
        createTimerBtn.maximumSize.width = 235;

        function refreshStyles() {
            styleDD.removeAll();
            if (!familyDD.selection) return;
            var list = familyFonts[familyDD.selection.text] || [];
            for (var i = 0; i < list.length; i++) styleDD.add("item", list[i].styleName || "Regular");
            if (styleDD.items.length) styleDD.selection = 0;
        }
        familyDD.onChange = function() {
            refreshStyles();
            var font = selectedFont(familyDD, styleDD);
            if (font) {
                app.beginUndoGroup("Cambiar tipografía");
                try { updateSelectedTextDocument(function(doc) { doc.font = font.postScriptName; }); } finally { app.endUndoGroup(); }
            }
        };
        styleDD.onChange = function() {
            var font = selectedFont(familyDD, styleDD);
            if (font) {
                app.beginUndoGroup("Cambiar estilo tipográfico");
                try { updateSelectedTextDocument(function(doc) { doc.font = font.postScriptName; }); } finally { app.endUndoGroup(); }
            }
        };

        function selectDefaultFont(familyName, styleName) {
            var familyIndex = -1;
            var wantedFamily = familyName.toLowerCase();
            var wantedStyle = styleName.toLowerCase().replace(/[\s_-]/g, "");

            for (var i = 0; i < familyDD.items.length; i++) {
                if (familyDD.items[i].text.toLowerCase() === wantedFamily) {
                    familyIndex = i;
                    break;
                }
            }

            familyDD.selection = familyIndex >= 0 ? familyIndex : 0;
            refreshStyles();

            if (familyIndex >= 0) {
                for (var j = 0; j < styleDD.items.length; j++) {
                    var currentStyle = styleDD.items[j].text.toLowerCase().replace(/[\s_-]/g, "");
                    if (currentStyle === wantedStyle || currentStyle.indexOf(wantedStyle) >= 0) {
                        styleDD.selection = j;
                        break;
                    }
                }
            }
        }

        if (familyDD.items.length) selectDefaultFont("Mangueira", "SemiBold");

        textInput.onChange = function() {
            app.beginUndoGroup("Editar texto seleccionado");
            try { applySelectedTextContent(textInput.text); } finally { app.endUndoGroup(); }
        };
        sizeInput.onChange = function() {
            var size = Math.max(1, num(sizeInput, 72));
            sizeInput.text = size.toString();
            app.beginUndoGroup("Cambiar tamaño de texto");
            try { updateSelectedTextDocument(function(doc) { doc.fontSize = size; }); } finally { app.endUndoGroup(); }
        };
        topInput.onChange = function() {
            var v = Math.max(0, num(topInput, 24));
            topInput.text = v.toString();
            app.beginUndoGroup("Cambiar margen superior");
            try { applyBoxSliderToSelection("Margen superior", v); } finally { app.endUndoGroup(); }
        };
        bottomInput.onChange = function() {
            var v = Math.max(0, num(bottomInput, 24));
            bottomInput.text = v.toString();
            app.beginUndoGroup("Cambiar margen inferior");
            try { applyBoxSliderToSelection("Margen inferior", v); } finally { app.endUndoGroup(); }
        };

        roundSlider.onChanging = function() {
            var v = Math.round(roundSlider.value);
            roundInput.text = v.toString();
            applyBoxSliderToSelection("Redondeo", v);
        };
        roundInput.onChange = function() {
            roundSlider.value = clamp(num(roundInput, 24), 0, 200);
            roundInput.text = Math.round(roundSlider.value).toString();
            app.beginUndoGroup("Cambiar redondeo de caja");
            try { applyBoxSliderToSelection("Redondeo", Math.round(roundSlider.value)); } finally { app.endUndoGroup(); }
        };
        sideSlider.onChanging = function() {
            var v = Math.round(sideSlider.value);
            sideInput.text = v.toString();
            applyBoxSliderToSelection("Márgenes laterales", v);
        };
        sideInput.onChange = function() {
            sideSlider.value = clamp(num(sideInput, 32), 0, 300);
            sideInput.text = Math.round(sideSlider.value).toString();
            app.beginUndoGroup("Cambiar márgenes laterales");
            try { applyBoxSliderToSelection("Márgenes laterales", Math.round(sideSlider.value)); } finally { app.endUndoGroup(); }
        };
        textColorBtn.onClick = function() {
            var c = $.colorPicker();
            if (c >= 0) {
                textColor = colorFromPicker(c);
                textColorBtn.text = "Texto " + colorToHex(textColor);
                textColorSwatch.notify("onDraw");
                app.beginUndoGroup("Cambiar color de texto");
                try { applyTextColorToSelection(textColor); } finally { app.endUndoGroup(); }
            }
        };
        boxColorBtn.onClick = function() {
            var c = $.colorPicker();
            if (c >= 0) {
                boxColor = colorFromPicker(c);
                boxColorBtn.text = "Elegir " + colorToHex(boxColor);
                boxColorSwatch.notify("onDraw");
                app.beginUndoGroup("Cambiar color de caja");
                try { applyBoxColorToSelection(boxColor); } finally { app.endUndoGroup(); }
            }
        };


        function applyToSelectedText(actionName, callback) {
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) { alert("Abre o selecciona una composición."); return; }
            var layers = selectedRealignLayers(comp);
            if (!layers.length) { alert("Selecciona una o más capas de texto, fecha o timer."); return; }
            app.beginUndoGroup(actionName);
            try {
                for (var i = 0; i < layers.length; i++) callback(layers[i], comp);
            } catch (err) {
                alert("ReAlign: " + err.toString());
            } finally {
                app.endUndoGroup();
            }
        }

        function setActiveAlignmentButton(activeButton) {
            var buttons = [alignLeftBtn, alignCenterBtn, alignRightBtn];
            for (var i = 0; i < buttons.length; i++) {
                buttons[i].active = buttons[i] === activeButton;
                buttons[i].notify("onDraw");
            }
        }
        alignLeftBtn.onClick = function() { applyToSelectedText("Alinear texto izquierda", function(layer) { if (layer instanceof TextLayer) setTextJustificationKeepPlace(layer, ParagraphJustification.LEFT_JUSTIFY); }); setActiveAlignmentButton(alignLeftBtn); };
        alignCenterBtn.onClick = function() { applyToSelectedText("Alinear texto centro", function(layer) { if (layer instanceof TextLayer) setTextJustificationKeepPlace(layer, ParagraphJustification.CENTER_JUSTIFY); }); setActiveAlignmentButton(alignCenterBtn); };
        alignRightBtn.onClick = function() { applyToSelectedText("Alinear texto derecha", function(layer) { if (layer instanceof TextLayer) setTextJustificationKeepPlace(layer, ParagraphJustification.RIGHT_JUSTIFY); }); setActiveAlignmentButton(alignRightBtn); };

        createTimerBtn.onClick = function() {
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) { alert("Abre o selecciona una composición."); return; }
            var font = selectedFont(familyDD, styleDD);
            if (!font) { alert("No se pudo obtener la tipografía seleccionada."); return; }

            var startValue = num(timerStartInput, 0);
            var endValue = num(timerEndInput, 60);
            var descending = timerModeDD.selection && timerModeDD.selection.index === 1;
            if (descending && startValue < endValue) {
                var swapValue = startValue;
                startValue = endValue;
                endValue = swapValue;
            } else if (!descending && startValue > endValue) {
                var swapValueUp = startValue;
                startValue = endValue;
                endValue = swapValueUp;
            }
            var duration = Math.max(comp.frameDuration, num(timerDurationInput, 10));
            var places = Math.round(clamp(num(decimalPlacesInput, 0), 0, 6));
            var thousand = thousandDD.selection ? thousandDD.selection.text : ",";
            if (thousand === "espacio") thousand = " ";
            if (thousand === "ninguno") thousand = "";
            var decimal = decimalDD.selection ? decimalDD.selection.text : ".";
            var useTime = minutesCheck.value || secondsCheck.value || millisCheck.value;

            app.beginUndoGroup("Crear timer");
            try {
                var timerLayer = comp.layers.addText("00:00.000");
                timerLayer.name = uniqueLayerName(comp, "Timer");
                var source = timerLayer.property("ADBE Text Properties").property("ADBE Text Document");
                var doc = source.value;
                try { doc.resetCharStyle(); } catch (resetErr) {}
                doc.font = font.postScriptName;
                doc.fontSize = Math.max(1, num(sizeInput, 72));
                doc.applyFill = true;
                doc.fillColor = textColor;
                doc.justification = ParagraphJustification.CENTER_JUSTIFY;
                source.setValue(doc);
                timerLayer.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width/2, comp.height/2]);

                var sliderFx = timerLayer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
                sliderFx.name = "Valor del timer";
                var slider = sliderFx.property(1);
                slider.setValueAtTime(comp.time, startValue);
                slider.setValueAtTime(comp.time + duration, endValue);

                function q(v) { return '"' + String(v) + '"'; }
                var expr = '';
                expr += 'var v=effect("Valor del timer")("Slider");\n';
                if (useTime) {
                    expr += 'var neg=v<0?"-":""; var t=Math.abs(v);\n';
                    expr += 'var d=Math.floor(t/86400); var h=Math.floor(t/3600)%24; var m=Math.floor(t/60)%60; var s=Math.floor(t)%60; var ms=Math.floor((t-Math.floor(t))*1000);\n';
                    expr += 'function pad(n,w){n=Math.floor(n).toString();while(n.length<w)n="0"+n;return n;}\n';
                    expr += 'var a=[];\n';
                    if (minutesCheck.value) expr += 'a.push(pad(Math.floor(t/60),2));\n';
                    if (secondsCheck.value) expr += 'a.push(pad(s,2));\n';
                    expr += 'var out=neg+a.join(":");\n';
                    if (millisCheck.value) expr += 'out+=(a.length?".":"")+pad(ms,3);\n';
                    expr += 'out;';
                } else {
                    expr += 'var p=' + places + '; var dec=' + q(decimal) + '; var thou=' + q(thousand) + ';\n';
                    expr += 'var parts=Math.abs(v).toFixed(p).split("."); var sign=v<0?"-":"";\n';
                    expr += 'if(thou!="") parts[0]=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,thou);\n';
                    expr += 'sign+parts[0]+(p>0?dec+parts[1]:"");';
                }
                source.expression = expr;

                var timerShape = null;
                if (timerBoxCheck.value || animateTimerInCheck.value || animateTimerOutCheck.value) {
                    timerShape = comp.layers.addShape();
                    timerShape.name = "Caja - " + timerLayer.name;
                    timerShape.moveAfter(timerLayer);

                    addSlider(timerShape, "Margen superior", Math.max(0, num(topInput, 24)));
                    addSlider(timerShape, "Margen inferior", Math.max(0, num(bottomInput, 24)));
                    addSlider(timerShape, "Márgenes laterales", Math.max(0, num(sideInput, 32)));
                    addSlider(timerShape, "Redondeo", Math.max(0, num(roundInput, 24)));
                    addSlider(timerShape, "Apertura caja", 100);

                    var timerRoot = timerShape.property("ADBE Root Vectors Group");
                    var timerGroup = timerRoot.addProperty("ADBE Vector Group");
                    timerGroup.name = "Fondo adaptable";
                    var timerContents = timerGroup.property("ADBE Vectors Group");
                    timerContents.addProperty("ADBE Vector Shape - Rect");
                    timerContents.addProperty("ADBE Vector Graphic - Fill");

                    var timerRect = timerContents.property("ADBE Vector Shape - Rect");
                    var timerFill = timerContents.property("ADBE Vector Graphic - Fill");
                    if (!timerRect || !timerFill) throw new Error("No se pudo crear la caja del timer.");
                    timerFill.property("ADBE Vector Fill Color").setValue(boxColor);

                    var timerTargetName = esc(timerLayer.name);
                    timerRect.property("ADBE Vector Rect Size").expression =
                        'var t=thisComp.layer("' + timerTargetName + '");\n' +
                        'var r=t.sourceRectAtTime(time,false);\n' +
                        'var H=effect("Márgenes laterales")("Slider");\n' +
                        'var T=effect("Margen superior")("Slider");\n' +
                        'var B=effect("Margen inferior")("Slider");\n' +
                        '[(r.width+H*2)*(effect("Apertura caja")("Slider")/100),r.height+T+B];';
                    timerRect.property("ADBE Vector Rect Position").expression =
                        'var t=thisComp.layer("' + timerTargetName + '");\n' +
                        'var r=t.sourceRectAtTime(time,false);\n' +
                        'var T=effect("Margen superior")("Slider");\n' +
                        'var B=effect("Margen inferior")("Slider");\n' +
                        '[r.left+r.width/2-t.anchorPoint[0],r.top+r.height/2-t.anchorPoint[1]+(B-T)/2];';
                    timerRect.property("ADBE Vector Rect Roundness").expression = 'effect("Redondeo")("Slider")';
                    var timerShapePosition=timerShape.property("ADBE Transform Group").property("ADBE Position");
                    timerShapePosition.setValue(timerLayer.property("ADBE Transform Group").property("ADBE Position").value);
                    var timerController=null;
                    if(animateTimerInCheck.value||animateTimerOutCheck.value) timerController=animateBoxAndText(comp,timerLayer,timerShape,num(timerAnimationDurationInput,0.6),animateTimerInCheck.value,animateTimerOutCheck.value,Math.max(0,num(topInput,24)),Math.max(0,num(bottomInput,24)));
                    else timerShapePosition.expression='thisComp.layer("'+timerTargetName+'").transform.position';
                    timerShape.selected=true;
                }

                if (precompTimerCheck.value) {
                    precomposeLayers(comp, timerController ? [timerController,timerLayer,timerShape] : (timerShape ? [timerLayer,timerShape] : [timerLayer]), "Precomp - " + timerLayer.name);
                } else {
                    timerLayer.selected = true;
                }
            } catch (err) {
                alert("Error al crear timer: " + err.toString() + (err.line ? "\nLínea: " + err.line : ""));
            } finally {
                app.endUndoGroup();
            }
        };

        createDateBtn.onClick = function() {
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) { alert("Abre o selecciona una composición."); return; }
            var font = selectedFont(familyDD, styleDD);
            if (!font) { alert("No se pudo obtener la tipografía seleccionada."); return; }
            var dateText = dayDD.selection.text + " / " + monthDD.selection.text + " / " + yearDD.selection.text;

            app.beginUndoGroup("Crear fecha");
            try {
                var dateName = uniqueLayerName(comp, "Fecha");
                var dateLayer = comp.layers.addText(dateText);
                dateLayer.name = dateName;
                var dateSource = dateLayer.property("ADBE Text Properties").property("ADBE Text Document");
                var dateDoc = dateSource.value;
                try { dateDoc.resetCharStyle(); } catch (resetErr) {}
                dateDoc.font = font.postScriptName;
                dateDoc.fontSize = Math.max(1, num(sizeInput, 72));
                dateDoc.applyFill = true;
                dateDoc.fillColor = textColor;
                dateDoc.justification = ParagraphJustification.CENTER_JUSTIFY;
                dateSource.setValue(dateDoc);
                dateLayer.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width/2, comp.height/2]);

                var dateShape = null;
                if (dateBoxCheck.value || animateDateInCheck.value || animateDateOutCheck.value) {
                    dateShape = comp.layers.addShape();
                    dateShape.name = "Caja - " + dateName;
                    dateShape.moveAfter(dateLayer);
                    addSlider(dateShape, "Margen superior", Math.max(0, num(topInput, 24)));
                    addSlider(dateShape, "Margen inferior", Math.max(0, num(bottomInput, 24)));
                    addSlider(dateShape, "Márgenes laterales", Math.max(0, num(sideInput, 32)));
                    addSlider(dateShape, "Redondeo", Math.max(0, num(roundInput, 24)));
                    addSlider(dateShape, "Apertura caja", 100);
                    var dateRoot = dateShape.property("ADBE Root Vectors Group");
                    var dateGroup = dateRoot.addProperty("ADBE Vector Group");
                    dateGroup.name = "Fondo adaptable";
                    var dateContents = dateGroup.property("ADBE Vectors Group");
                    dateContents.addProperty("ADBE Vector Shape - Rect");
                    dateContents.addProperty("ADBE Vector Graphic - Fill");
                    var dateRect = dateContents.property("ADBE Vector Shape - Rect");
                    var dateFill = dateContents.property("ADBE Vector Graphic - Fill");
                    dateFill.property("ADBE Vector Fill Color").setValue(boxColor);
                    var dateTarget = esc(dateLayer.name);
                    dateRect.property("ADBE Vector Rect Size").expression =
                        'var t=thisComp.layer("' + dateTarget + '");\nvar r=t.sourceRectAtTime(time,false);\nvar H=effect("Márgenes laterales")("Slider");\nvar T=effect("Margen superior")("Slider");\nvar B=effect("Margen inferior")("Slider");\n[(r.width+H*2)*(effect("Apertura caja")("Slider")/100),r.height+T+B];';
                    dateRect.property("ADBE Vector Rect Position").expression =
                        'var t=thisComp.layer("' + dateTarget + '");\nvar r=t.sourceRectAtTime(time,false);\nvar T=effect("Margen superior")("Slider");\nvar B=effect("Margen inferior")("Slider");\n[r.left+r.width/2,r.top+r.height/2+(B-T)/2];';
                    dateRect.property("ADBE Vector Rect Roundness").expression = 'effect("Redondeo")("Slider")';
                    var dateShapePosition=dateShape.property("ADBE Transform Group").property("ADBE Position");
                    dateShapePosition.setValue(dateLayer.property("ADBE Transform Group").property("ADBE Position").value);
                    var dateController=null;
                    if(animateDateInCheck.value||animateDateOutCheck.value) dateController=animateBoxAndText(comp,dateLayer,dateShape,num(dateAnimationDurationInput,0.6),animateDateInCheck.value,animateDateOutCheck.value,Math.max(0,num(topInput,24)),Math.max(0,num(bottomInput,24)));
                    else dateShapePosition.expression='thisComp.layer("'+dateTarget+'").transform.position';
                }

                if (precompDateCheck.value) {
                    precomposeLayers(comp, dateController ? [dateController,dateLayer,dateShape] : (dateShape ? [dateLayer,dateShape] : [dateLayer]), "Precomp - " + dateName);
                } else {
                    dateLayer.selected = true;
                    if (dateShape) dateShape.selected = true;
                }
            } catch (err) {
                alert("Error al crear fecha: " + err.toString() + (err.line ? "\nLínea: " + err.line : ""));
            } finally {
                app.endUndoGroup();
            }
        };

        createBtn.onClick = function() {
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) { alert("Abre o selecciona una composición."); return; }
            var font = selectedFont(familyDD, styleDD);
            if (!font) { alert("No se pudo obtener la tipografía seleccionada."); return; }

            app.beginUndoGroup(SCRIPT_NAME);
            try {
                var pairName = uniqueLayerName(comp, "Texto con caja");
                var textLayer = comp.layers.addText(textInput.text || "Texto");
                textLayer.name = pairName;
                var source = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
                var doc = source.value;
                try { doc.resetCharStyle(); } catch (resetErr) {}
                doc.font = font.postScriptName;
                doc.fontSize = Math.max(1, num(sizeInput, 72));
                doc.applyFill = true;
                doc.fillColor = textColor;
                doc.justification = ParagraphJustification.CENTER_JUSTIFY;
                source.setValue(doc);
                textLayer.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width/2, comp.height/2]);

                var shape = comp.layers.addShape();
                shape.name = "Caja - " + pairName;
                shape.moveAfter(textLayer);

                addSlider(shape, "Margen superior", Math.max(0, num(topInput, 24)));
                addSlider(shape, "Margen inferior", Math.max(0, num(bottomInput, 24)));
                addSlider(shape, "Márgenes laterales", Math.max(0, num(sideInput, 32)));
                addSlider(shape, "Redondeo", Math.max(0, num(roundInput, 24)));
                addSlider(shape, "Apertura caja", 100);

                var root = shape.property("ADBE Root Vectors Group");
                var group = root.addProperty("ADBE Vector Group");
                group.name = "Fondo adaptable";
                var contents = group.property("ADBE Vectors Group");
                contents.addProperty("ADBE Vector Shape - Rect");
                contents.addProperty("ADBE Vector Graphic - Fill");

                // addProperty() can invalidate previously stored Property references.
                // Reacquire both properties after the group structure is complete.
                var rect = contents.property("ADBE Vector Shape - Rect");
                var fill = contents.property("ADBE Vector Graphic - Fill");
                if (!rect || !fill) throw new Error("No se pudieron crear Rectángulo y Relleno.");
                fill.property("ADBE Vector Fill Color").setValue(boxColor);

                var targetName = esc(textLayer.name);
                rect.property("ADBE Vector Rect Size").expression =
                    'var t=thisComp.layer("' + targetName + '");\n' +
                    'var r=t.sourceRectAtTime(time,false);\n' +
                    'var H=effect("Márgenes laterales")("Slider");\n' +
                    'var T=effect("Margen superior")("Slider");\n' +
                    'var B=effect("Margen inferior")("Slider");\n' +
                    'var A=effect("Apertura caja")("Slider")/100;\n' +
                    '[(r.width+H*2)*A,r.height+T+B];';
                rect.property("ADBE Vector Rect Position").expression =
                    'var t=thisComp.layer("' + targetName + '");\n' +
                    'var r=t.sourceRectAtTime(time,false);\n' +
                    'var T=effect("Margen superior")("Slider");\n' +
                    'var B=effect("Margen inferior")("Slider");\n' +
                    '[r.left+r.width/2-t.anchorPoint[0],r.top+r.height/2-t.anchorPoint[1]+(B-T)/2];';
                rect.property("ADBE Vector Rect Roundness").expression = 'effect("Redondeo")("Slider")';
                var finalPosition = textLayer.property("ADBE Transform Group").property("ADBE Position").value;
                var shapePosition = shape.property("ADBE Transform Group").property("ADBE Position");
                shapePosition.setValue([finalPosition[0], finalPosition[1]]);

                var textController = null;
                if (animateTextCheck.value || animateTextOutCheck.value) {
                    textController = animateBoxAndText(comp,textLayer,shape,num(animationDurationInput,0.6),animateTextCheck.value,animateTextOutCheck.value,Math.max(0,num(topInput,24)),Math.max(0,num(bottomInput,24)));
                } else shapePosition.expression = 'thisComp.layer("' + targetName + '").transform.position';

                if (precompTextCheck.value) {
                    var originalTime = comp.time;
                    if (animateTextCheck.value || animateTextOutCheck.value) comp.time = originalTime + Math.max(comp.frameDuration * 5, num(animationDurationInput, 0.6));
                    precomposeLayers(comp, textController ? [textController, textLayer, shape] : [textLayer, shape], "Precomp - " + pairName);
                    comp.time = originalTime;
                } else {
                    textLayer.selected = true;
                    shape.selected = true;
                }
            } catch (err) {
                alert("Error: " + err.toString() + (err.line ? "\nLínea: " + err.line : ""));
            } finally {
                app.endUndoGroup();
            }
        };

        updateAllBtn = textScroll.content.add("button", undefined, "Actualizar todo en selección");
        updateAllBtn.alignment = ["fill", "top"];
        updateAllBtn.preferredSize.width = 235;
        updateAllBtn.maximumSize.width = 235;
        updateAllBtn.alignment = ["center", "top"];
        updateAllBtn.helpTip = "Aplica texto, tipografía, estilo, tamaño, colores, márgenes y redondeo a las capas seleccionadas.";
        updateAllBtn.preferredSize.height = 30;
        updateAllBtn.minimumSize.height = 30;
        updateAllBtn.maximumSize.height = 30;
        updateAllBtn.onDraw = function() {
            var g = this.graphics;
            var bg = g.newBrush(g.BrushType.SOLID_COLOR, [1.0, 0.78, 0.05]);
            var border = g.newPen(g.PenType.SOLID_COLOR, [0.65, 0.48, 0.0], 1);
            var textPen = g.newPen(g.PenType.SOLID_COLOR, [0.08, 0.08, 0.08], 1);
            g.newPath();
            g.rectPath(0.5, 0.5, this.size.width - 1, this.size.height - 1);
            g.fillPath(bg);
            g.strokePath(border);
            var bounds = g.measureString(this.text, g.font);
            g.drawString(this.text, textPen, (this.size.width - bounds[0]) / 2, (this.size.height - bounds[1]) / 2, g.font);
        };

        updateAllBtn.onClick = function() {
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) { alert("Abre o selecciona una composición."); return; }
            if (!comp.selectedLayers.length) { alert("Selecciona capas de texto, timer, fecha o caja."); return; }
            var font = selectedFont(familyDD, styleDD);
            var fontSize = Math.max(1, num(sizeInput, 72));
            var roundValue = Math.round(clamp(num(roundInput, 24), 0, 200));
            var sideValue = Math.round(clamp(num(sideInput, 32), 0, 300));
            var topValue = Math.max(0, num(topInput, 24));
            var bottomValue = Math.max(0, num(bottomInput, 24));

            app.beginUndoGroup("Actualizar todo en selección");
            try {
                updateSelectedTextDocument(function(doc, layer) {
                    var source = layer.property("ADBE Text Properties").property("ADBE Text Document");
                    if (!source.expressionEnabled && textInput.text !== "") doc.text = textInput.text;
                    if (font) doc.font = font.postScriptName;
                    doc.fontSize = fontSize;
                    doc.applyFill = true;
                    doc.fillColor = textColor;
                });
                applyBoxColorToSelection(boxColor);
                applyBoxSliderToSelection("Redondeo", roundValue);
                applyBoxSliderToSelection("Márgenes laterales", sideValue);
                applyBoxSliderToSelection("Margen superior", topValue);
                applyBoxSliderToSelection("Margen inferior", bottomValue);
            } catch (err) {
                alert("No se pudo actualizar todo: " + err.toString());
            } finally {
                app.endUndoGroup();
            }
        };


        textScroll.bar.onChanging = textScroll.bar.onChange = function() { scrollTabBy(textScroll, 0); };
        dateScroll.bar.onChanging = dateScroll.bar.onChange = function() { scrollTabBy(dateScroll, 0); };
        timerScroll.bar.onChanging = timerScroll.bar.onChange = function() { scrollTabBy(timerScroll, 0); };

        mainTabs.onChange = function() {
            if (mainTabs.selection === textTab) updateTabScroll(textScroll, true);
            else if (mainTabs.selection === dateTab) updateTabScroll(dateScroll, true);
            else updateTabScroll(timerScroll, true);
        };

        w.onResizing = w.onResize = function() {
            this.size.width = 375;
            if (this.size.height < 360) this.size.height = 360;
            mainTabs.preferredSize.height = Math.max(280, this.size.height - 70);
            this.layout.resize();
            updateTabScroll(textScroll, true);
            updateTabScroll(dateScroll, true);
            updateTabScroll(timerScroll, true);
        };
        w.layout.layout(true);
        w.layout.resize();
        updateTabScroll(textScroll, true);
        updateTabScroll(dateScroll, true);
        updateTabScroll(timerScroll, true);
        return w;
    }

    try { loadFonts(); } catch (fontLoadError) { families = []; familyFonts = {}; }
    var panel = buildUI(thisObj);
    if (panel instanceof Window) { panel.center(); panel.show(); }
})(this);
