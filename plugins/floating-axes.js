(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['tauCharts'], function (tauPlugins) {
            return factory(tauPlugins);
        });
    } else if (typeof module === 'object' && module.exports) {
        var tauPlugins = require('tauCharts');
        module.exports = factory(tauPlugins);
    } else {
        factory(this.tauCharts);
    }
})(function (tauCharts) {

    var utils = tauCharts.api.utils;
    var d3 = tauCharts.api.d3;

    var SHADOW_SIZE = 16;
    var SHADOW_COLOR_0 = '#E5E7EB';
    var SHADOW_COLOR_1 = '#FFFFFF';
    var SHADOW_OPACITY_0 = 1;
    var SHADOW_OPACITY_1 = 0;

    var storeProp = '__transitionAttrs__';
    var parentProp = '__floatingAxesSrcParent__';
    var transProp = '__floatingAxesSrcTransform__';

    function floatingAxes(_settings) {

        var settings = utils.defaults(_settings || {}, {
            bgcolor: '#fff'
        });

        return {

            init: function (chart) {
                this.chart = chart;
                this.rootNode = chart.getLayout().contentContainer;

                this.beforeExportHandler = chart.on('beforeExportSVGNode', function () {
                    this.removeFloatingLayout();
                }, this);
                this.afterExportHandler = chart.on('afterExportSVGNode', function () {
                    this.createFloatingLayout();
                }, this);
            },

            onBeforeRender: function () {
                this.removeFloatingLayout();
            },

            onRender: function () {

                var applicable = true;
                this.chart.traverseSpec(this.chart.getSpec(), function (unit) {
                    var isCoordNode = (unit && (unit.type.indexOf('COORDS.') === 0));
                    if (isCoordNode) {
                        if (unit.type !== 'COORDS.RECT') {
                            // non-rectangular coordinates
                            applicable = false;
                        } else {
                            var guide = unit.guide || {};
                            if (guide.autoLayout !== 'extract-axes') {
                                // non-extract axes
                                applicable = false;
                            }
                        }
                    }
                });

                if (applicable) {
                    this.floatingLayout = this.createFloatingLayout();
                }
            },

            destroy: function () {
                this.removeFloatingLayout();
                this.chart.removeHandler(this.beforeExportHandler, this);
                this.chart.removeHandler(this.afterExportHandler, this);
            },

            createFloatingLayout: function () {

                var root = this.rootNode;
                var svg = this.chart.getSVG();
                var d3Svg = d3.select(svg);
                var scrollManager = this.scrollManager = new ScrollManager(root);

                var axes = (function () {
                    var getAxesSelector = function (axis) {
                        var axisPart = '> .' + axis + '.axis.tau-active';
                        var rootPart = '.frame-root.tau-active ';
                        return [
                            rootPart + axisPart,
                            rootPart + '.cell.tau-active ' + axisPart
                        ].join(', ');
                    };
                    return {
                        x: Array.prototype.slice.call(
                            svg.querySelectorAll(getAxesSelector('x')), 0
                        ),
                        y: Array.prototype.slice.call(
                            svg.querySelectorAll(getAxesSelector('y')), 0
                        )
                    };
                })();

                var axesInfo = (function () {
                    function getAxisInfo(axis) {
                        var parentTransform = getDeepTransform(axis.parentNode);
                        var axisTransform = getDynamicTransform(axis);
                        return {
                            axis: axis,
                            parentTransform: parentTransform,
                            axisTransform: axisTransform
                        };
                    }
                    return {
                        x: axes.x.map(getAxisInfo),
                        y: axes.y.map(getAxisInfo)
                    };
                })();

                var maxYAxesX = mmin(axesInfo.y.map(function (i) {
                    return (i.axisTransform.translate.x + i.parentTransform.translate.x);
                })) + 1;
                var minXAxesY = mmin(axesInfo.x.map(function (i) {
                    return (i.axisTransform.translate.y + i.parentTransform.translate.y);
                })) - 1;
                var scrollbars = tauCharts.api.globalSettings.getScrollbarSize(root);

                function getPositions() {
                    return {
                        scrollLeft: root.scrollLeft,
                        scrollTop: root.scrollTop,
                        visibleWidth: root.clientWidth,
                        visibleHeight: root.clientHeight,
                        scrollbarWidth: scrollbars.width,
                        scrollbarHeight: scrollbars.height,
                        svgWidth: Number(d3Svg.attr('width')),
                        svgHeight: Number(d3Svg.attr('height')),
                        minXAxesY: minXAxesY,
                        maxYAxesX: maxYAxesX
                    };
                };

                var pos = getPositions();

                var defs = (function createSVGDefinitions() {
                    var defs = d3Svg.append('defs')
                        .attr('class', 'floating-axes');

                    var directions = {
                        ns: {x1: 0, y1: 0, x2: 0, y2: 1},
                        ew: {x1: 1, y1: 0, x2: 0, y2: 0},
                        sn: {x1: 0, y1: 1, x2: 0, y2: 0},
                        we: {x1: 0, y1: 0, x2: 1, y2: 0}
                    };
                    Object.keys(directions).forEach(function (d) {
                        var coords = directions[d];
                        var g = defs.append('linearGradient')
                            .attr('id', 'shadow-gradient-' + d)
                            .attr('x1', coords.x1)
                            .attr('y1', coords.y1)
                            .attr('x2', coords.x2)
                            .attr('y2', coords.y2);
                        g.append('stop')
                            .attr('class', 'floating-axes_shadow-start')
                            .attr('offset', '0%')
                            .attr('stop-color', SHADOW_COLOR_0)
                            .attr('stop-opacity', SHADOW_OPACITY_0);
                        g.append('stop')
                            .attr('class', 'floating-axes_shadow-end')
                            .attr('offset', '100%')
                            .attr('stop-color', SHADOW_COLOR_1)
                            .attr('stop-opacity', SHADOW_OPACITY_1);
                    });
                    return defs;
                })();

                function transferAxes(floating, axesInfo) {
                    axesInfo.forEach(function (i) {
                        i.axis[parentProp] = i.axis.parentNode;
                        floating.append('g')
                            .attr('transform', translate(
                                i.parentTransform.translate.x,
                                i.parentTransform.translate.y
                            ))
                            .node()
                            .appendChild(i.axis);
                        Array.prototype.forEach.call(
                            i.axis.querySelectorAll('.label'),
                            function (label) {
                                label[transProp] = label.getAttribute('transform');
                            }
                        );
                    });
                };

                var xAxes = (function extractXAxes() {
                    var axisHeight = pos.svgHeight - pos.minXAxesY + 1 + pos.scrollbarHeight;

                    var g = d3Svg.append('g')
                        .attr('class', 'floating-axes floating-axes-x')
                        .call(addBackground, pos.svgWidth, axisHeight);

                    transferAxes(g, axesInfo.x);

                    var labels = g.selectAll('.label');

                    scrollManager
                        .handleVisibilityFor(g, 'y')
                        .handleVisibilityFor(labels, 'x')
                        .onScroll(function (scrollLeft, scrollTop) {
                            var x = 0;
                            var yLimit = 0;
                            var y = Math.min(
                                (pos.visibleHeight + scrollTop - pos.svgHeight - pos.scrollbarHeight),
                                yLimit
                            );
                            g.attr('transform', translate(x, y));
                            labels.each(function () {
                                var t = parseTransform(this[transProp]);
                                var dx = -pos.svgWidth / 2 + pos.visibleWidth / 2 + scrollLeft;
                                this.setAttribute(
                                    'transform',
                                    'translate(' + (t.x + dx) + ',' + t.y + ') rotate(' + t.r + ')'
                                );
                            });
                        });

                    return g;
                })();

                var yAxes = (function extractYAxes() {
                    var g = d3Svg.append('g')
                        .attr('class', 'floating-axes floating-axes-y')
                        .call(addBackground, pos.maxYAxesX, pos.svgHeight);

                    transferAxes(g, axesInfo.y);

                    var labels = g.selectAll('.label');

                    scrollManager
                        .handleVisibilityFor(g, 'x')
                        .handleVisibilityFor(labels, 'y')
                        .onScroll(function (scrollLeft, scrollTop) {
                            var xLimit = 0;
                            var x = Math.max(scrollLeft, xLimit);
                            var y = 0;
                            g.attr('transform', translate(x, y));
                            labels.each(function () {
                                var t = parseTransform(this[transProp]);
                                var dy = -pos.svgHeight / 2 + pos.visibleHeight / 2 + scrollTop;
                                this.setAttribute(
                                    'transform',
                                    'translate(' + t.x + ',' + (t.y + dy) + ') rotate(' + t.r + ')'
                                );
                            });
                        });

                    return g;
                })();

                var corner = (function createCorner() {
                    var xAxesHeight = pos.svgHeight - pos.minXAxesY + pos.scrollbarHeight;

                    var g = d3Svg.append('g')
                        .attr('class', 'floating-axes floating-axes-corner')
                        .call(addBackground, pos.maxYAxesX, xAxesHeight);

                    scrollManager
                        .handleVisibilityFor(g, 'xy')
                        .onScroll(function (scrollLeft, scrollTop) {
                            var bottomY = scrollTop + pos.visibleHeight;
                            var xLimit = 0;
                            var x = Math.max(scrollLeft, xLimit);
                            var yLimit = pos.minXAxesY;
                            var y = Math.min(
                                (scrollTop + pos.visibleHeight - xAxesHeight),
                                yLimit
                            );
                            g.attr('transform', translate(x, y));
                        });

                    return g;
                })();

                function addBackground(g, w, h) {
                    g.append('rect')
                        .attr('x', -1)
                        .attr('y', -1)
                        .attr('width', w + 2)
                        .attr('height', h + 2)
                        .attr('fill', settings.bgcolor);
                }

                var shadows = (function createShadows() {
                    var yAxesWidth = pos.maxYAxesX;
                    var xAxesHeight = pos.svgHeight - pos.minXAxesY + pos.scrollbarHeight;

                    var g = d3Svg.append('g')
                        .attr('class', 'floating-axes floating-axes-shadows')
                        .attr('pointer-events', 'none');

                    var createShadow = function (direction, x, y, width, height) {
                        return g.append('rect')
                            .attr('fill', 'url(#shadow-gradient-' + direction + ')')
                            .attr('x', x)
                            .attr('y', y)
                            .attr('width', width)
                            .attr('height', height);
                    };
                    var shadowNS = createShadow('ns', 0, 0, yAxesWidth, SHADOW_SIZE);
                    var shadowEW = createShadow('ew',
                        pos.visibleWidth - SHADOW_SIZE,
                        pos.visibleHeight - xAxesHeight,
                        SHADOW_SIZE,
                        xAxesHeight
                    );
                    var shadowSN = createShadow('sn',
                        0,
                        pos.visibleHeight - xAxesHeight - SHADOW_SIZE,
                        yAxesWidth,
                        SHADOW_SIZE
                    );
                    var shadowWE = createShadow('we',
                        yAxesWidth,
                        pos.visibleHeight - xAxesHeight,
                        SHADOW_SIZE,
                        xAxesHeight
                    );

                    scrollManager
                        .handleVisibilityFor(shadowNS, 'xy')
                        .handleVisibilityFor(shadowEW, 'xy')
                        .handleVisibilityFor(shadowSN, 'xy')
                        .handleVisibilityFor(shadowWE, 'xy');
                })();

                // Setup initial position
                scrollManager.fireScroll();

                return {
                    defs: defs,
                    xAxes: xAxes,
                    yAxes: yAxes,
                    corner: corner,
                    shadows: shadows
                };
            },

            removeFloatingLayout: function () {

                if (this.floatingLayout) {
                    this.floatingLayout.xAxes.call(returnAxes);
                    this.floatingLayout.yAxes.call(returnAxes);
                    this.scrollManager.destroy();
                }

                var d3Svg = d3.select(this.chart.getSVG());
                // TODO: Reuse elements.
                d3Svg.selectAll('.floating-axes').remove();

                function returnAxes(g) {
                    g.selectAll('.axis').each(function () {
                        this[parentProp].appendChild(this);
                        delete this[parentProp];
                        Array.prototype.forEach.call(
                            this.querySelectorAll('.label'),
                            function (label) {
                                label.setAttribute('transform', label[transProp]);
                                delete label[transProp];
                            }
                        );
                    });
                }
            }
        };
    }

    function mmin(arr) {
        return Math.min.apply(null, arr);
    };

    function mmax(arr) {
        return Math.max.apply(null, arr);
    };

    function translate(x, y) {
        return ('translate(' + x + ',' + y + ')');
    };

    function parseTransform(transform) {
        var result = { x: 0, y: 0, r: 0 };
        if (!transform) {
            return result;
        }
        var ts = transform.indexOf('translate(');
        if (ts >= 0) {
            var te = transform.indexOf(')', ts + 10);
            var translateStr = transform.substring(ts + 10, te);
            var translateParts = translateStr.trim().replace(',', ' ').replace(/\s+/, ' ').split(' ');
            result.x = parseFloat(translateParts[0]);
            if (translateParts.length > 1) {
                result.y = parseFloat(translateParts[1]);
            }
        }
        var rs = transform.indexOf('rotate(');
        if (rs >= 0) {
            var re = transform.indexOf(')', rs + 7);
            var rotateStr = transform.substring(rs + 7, re);
            result.r = parseFloat(rotateStr.trim());
        }
        return result;
    };

    function getDynamicTransform(node) {
        var isTransformInTransition = (node[storeProp] &&
            node[storeProp].transform);
        var currentTransform = parseTransform(node.getAttribute('transform'));
        var nextTransform = (isTransformInTransition ?
            parseTransform(node[storeProp].transform) :
            currentTransform);
        return {
            translate0: currentTransform.x,
            translate: nextTransform
        };
    };

    function getDeepTransform(node) {
        var info = {
            translate0: {x: 0, y: 0},
            translate: {x: 0, y: 0}
        };
        var parent = node;
        var transform;
        while (parent.nodeName.toUpperCase() !== 'SVG') {
            transform = getDynamicTransform(parent);
            info.translate0.x += transform.translate0.x;
            info.translate0.y += transform.translate0.y;
            info.translate.x += transform.translate.x;
            info.translate.y += transform.translate.y;
            parent = parent.parentNode;
        }
        return info;
    };

    function translateAxis(axisNode, x0, y0, x1, y1, animationSpeed) {
        if (animationSpeed > 0) {
            d3.select(axisNode)
                .attr('transform', translate(x0, y0))
                .transition('axisTransition')
                // TODO: Determine, how much time passed since last transition beginning.
                .duration(animationSpeed)
                .attr('transform', translate(x1, y1));
        } else {
            axisNode.setAttribute('transform', translate(x1, y1));
        }
    };

    function ScrollManager(_scrollContainer) {

        var HIDE_SCROLL_ITEMS_DURATION = 128;
        var SHOW_SCROLL_ITEMS_DURATION = 256;

        var items = { x: [], y: [] };
        var prevScroll = { x: 0, y: 0 };
        var scrollTimeout = { x: null, y: null };
        var scrollContainer = _scrollContainer;
        var scrollListeners = [];

        this.onScroll = function (listener) {
            scrollListeners.push(listener);
            return this;
        };

        /**
         * NOTE: As far as floating axes and labels jump during scroll
         * in most of browsers (except Chrome with big delta mousewheel)
         * due to the fact, that browser renders scrolled content first,
         * and only later fires `scroll` event, letting us return axes in place,
         * we are hiding floating axes, and show them after some delay.
         */
        this.handleVisibilityFor = function (d3Selection, scrollDirection) {
            if (scrollDirection.indexOf('x') >= 0) {
                items.x.push(d3Selection);
            }
            if (scrollDirection.indexOf('y') >= 0) {
                items.y.push(d3Selection);
            }
            return this;
        };

        var scrollListener = function () {
            var scrollLeft = scrollContainer.scrollLeft;
            var scrollTop = scrollContainer.scrollTop;
            scrollListeners.forEach(function (fn) {
                fn.call(null, scrollLeft, scrollTop);
            });

            var setupVisibility = function (d) {
                var scrollPos = (d === 'x' ? scrollLeft : scrollTop);
                if (scrollPos !== prevScroll[d]) {
                    clearTimeout(scrollTimeout[d]);
                    callSelections(items[d], function (s) {
                        s.transition('floatingAxes_scrollVisibility'); // Stop transition
                        s.attr('opacity', 1e-6);
                    });
                    scrollTimeout[d] = setTimeout(function () {
                        callSelections(items[d], function (s) {
                            scrollTimeout[d] = null;
                            s.transition('floatingAxes_scrollVisibility')
                                .duration(SHOW_SCROLL_ITEMS_DURATION)
                                .attr('opacity', 1);
                        });
                    }, HIDE_SCROLL_ITEMS_DURATION);
                }
                prevScroll[d] = scrollPos;
            };
            setupVisibility('x');
            setupVisibility('y');
        };
        scrollContainer.addEventListener('scroll', scrollListener);

        this.fireScroll = function () {
            scrollListener.call(null, scrollContainer.scrollLeft, scrollContainer.scrollTop);
        };

        this.destroy = function () {
            scrollContainer.removeEventListener('scroll', scrollListener);
        };

        function callSelections(arrayOfSelections, fn, context) {
            arrayOfSelections.forEach(function (s) {
                fn.call(context, s);
            });
        };
    };

    tauCharts.api.plugins.add('floating-axes', floatingAxes);

    return floatingAxes;
});