(function () {

    'use strict';

    var utils = tauCharts.api.utils;

    //----------------------------------------------
    // NOTE: Place paths to specs and datasets here.
    //
    var PATHS = {
        'specs/': [
            fileRange('ex-', range(0, 3), 5, range(9, 15)),
            'bar-labels',
            'category-labels-overflow',
            'horizontal-scroll',
            'logarithmic-scale',
            'smooth-line',
            'whiskers'
        ],
        'dev-quick-test/': fileRange(
            'ex-',
            range(0, 31),
            range(40, 48),
            range(50, 55)
        ),
        'datasets/': [
            'cars',
            'countries',
            'exoplanets',
            'data',
            'medals',
            'olympics',
            'tpStories'
        ]
    };

    //-------------------------
    // NOTE: Filter specs here.
    //
    function filterSpecs(allSpecs) {
        return allSpecs;
    }

    //------------------------------
    // NOTE: Modify chart spec here.
    //
    function modifySpec(spec) {
        return spec;
    }

    var TYPES = [
        'area',
        'bar',
        'horizontal-bar',
        'horizontal-stacked-bar',
        'line',
        'map',
        'parallel',
        'scatterplot',
        'stacked-area',
        'stacked-bar'
    ].sort();

    var PLUGINS = [
        'annotations',
        'box-whiskers',
        'exportTo',
        'floating-axes',
        'layers',
        'legend',
        'quick-filter',
        'settings',
        'tooltip',
        'trendline'
    ];

    var LAZY_RENDERING = true;

    var pluginConfigs = {
        'exportTo': {
            cssPaths: [
                '../css/tauCharts.default.css',
                '../css/export.default.css',
                '../css/legend.default.css',
                '../css/trendline.default.css',
                '../css/annotations.default.css',
                '../css/quick-filter.default.css'
            ]
        }
    };


    function DevApp(paths) {
        this._specs = [];
        this._datasets = {};
        this._charts = [];
        this._notRenderedSpecs = [];
        this._settings = this._loadSettings();
        this._initUI();
        if (paths) {
            this.load(paths);
        }
    }

    /**
     * Registers chart spec.
     */
    DevApp.prototype.spec = function (spec) {
        if (!document.currentScript) {
            this._unknownPathCounter = this._unknownPathCounter || 0;
        }
        var l = window.location;
        Object.defineProperty(spec, 'filePath', {
            value: (document.currentScript ?
                document.currentScript.src.replace(l.protocol + '//' + l.host + '/', '') :
                'Unknown path ' + this._unknownPathCounter++
            )
        });
        this._specs.push(spec);
    };

    /**
     * Registers spec in drop format.
     */
    DevApp.prototype.drop = function (dropCfg) {
        var spec = dropCfg.spec;
        var isArrayRow = dropCfg.data && Array.isArray(dropCfg.data[0]);
        spec.data = dropCfg.data.map(function (row) {
            return dropCfg.header.reduce(function (memo, h, i) {
                memo[h] = row[isArrayRow ? i : h];
                return memo;
            }, {});
        });

        this.spec(spec);
    };

    /**
     * If second argument is an object, registers a dataset.
     * Otherwise sets up a dataset loader, which will retrieve
     * dataset when chart will be loaded.
     */
    DevApp.prototype.dataset = function (name, dataOrFilter) {
        if (typeof dataOrFilter === 'object') {
            this._datasets[name] = dataOrFilter;
        } else {
            return new DatasetLoader(name, dataOrFilter);
        }
    };

    /**
     * Starts scripts loading.
     */
    DevApp.prototype.load = function (paths) {
        var pathsToLoad = getJSPaths(paths);
        var loaded = 0;
        for (var i = 0; i < pathsToLoad.length; i++) {
            var s = document.createElement('script');
            s.defer = true;
            s.onload = s.onerror = function () {
                loaded++;
                if (loaded === pathsToLoad.length) {
                    this._renderCharts();
                }
            }.bind(this);
            document.head.appendChild(s);
            s.src = pathsToLoad[i];
        }

    };

    DevApp.prototype._renderCharts = function () {

        var settings = this._settings;

        //
        // Destroy previous charts

        this._charts.forEach(function (c) {
            c.destroy();
        });
        this._notRenderedSpecs.splice(0);
        var container = document.getElementById('samplesContainer');
        container.innerHTML = '';

        // Set containers sizes
        document.getElementById('chartSizeStyle')
            .textContent = [
                '.sample {',
                settings.width ? ('  width: ' + settings.width + ';') : null,
                settings.height ? ('  height: ' + settings.height + ';') : null,
                '}'
            ].filter(function (d) { return Boolean(d); }).join('\n');

        //
        // Filter specs

        var specs = filterSpecs(this._specs.slice(0));
        if (settings.types.length) {
            specs = specs.filter(function (s) {
                return settings.types.indexOf(s.type) >= 0;
            });
        }
        if (settings.path) {
            var regex = new RegExp(settings.path.replace('\\', '\\\\'), 'i');
            specs = specs.filter(function (s) {
                return s.filePath.match(regex);
            });
        }
        this._reportFilterResult(specs.length, this._specs.length);

        //
        // Handle specs

        specs.forEach(function (s, i) {

            // Create DOM element
            var block = createElement([
                '<div class="sample">',
                '  <h2 class="sample__name">{{name}}</h2>',
                '  <h4 class="sample__desc">{{description}}</h4>',
                '  <div class="sample__chart"></div>',
                '</div>'
            ], {
                    name: s.filePath || i,
                    description: ('type: ' + s.type)
                });
            container.appendChild(block);
            var target = block.querySelector('.sample__chart');

            // Modify chart settings
            if (s.data instanceof DatasetLoader) {
                var loader = s.data;
                if (!(loader.name in this._datasets)) {
                    throw new Error('Dataset "' + loader.name + '" not found.');
                }
                var data = deepClone(this._datasets[loader.name]);
                s.data = loader.filter(data);
            }
            s = deepClone(s);
            s = modifySpec(s);
            if (settings.plugins.length > 0) {
                s.plugins = s.plugins || [];
                s.plugins.splice(0);
                settings.plugins.forEach(function (p) {
                    var config = pluginConfigs[p];
                    s.plugins.push(tauCharts.api.plugins.get(p)(config));
                });
            }

            this._notRenderedSpecs.push({
                spec: s,
                target: target
            });
        }, this);

        //
        // Render charts

        if (LAZY_RENDERING) {
            this._renderVisibleCharts();
        } else {
            var s, chart;
            while (this._notRenderedSpecs.length) {
                s = this._notRenderedSpecs.shift();
                chart = (s.spec.type ?
                    new tauCharts.Chart(s.spec) :
                    new tauCharts.Plot(s.spec));
                chart.renderTo(s.target);
                this._charts.push(chart);
            }
        };
    };

    DevApp.prototype._renderVisibleCharts = function () {
        var s, chart, rect;
        var top = document.documentElement.clientTop;
        var bottom = top + document.documentElement.clientHeight;
        for (var i = 0; i < this._notRenderedSpecs.length; i++) {
            s = this._notRenderedSpecs[i];
            rect = s.target.getBoundingClientRect();
            if (
                (rect.bottom > top && rect.bottom < bottom) ||
                (rect.top > top && rect.top < bottom) ||
                (rect.top <= top && rect.bottom >= bottom)
            ) {
                chart = (s.spec.type ?
                    new tauCharts.Chart(s.spec) :
                    new tauCharts.Plot(s.spec));
                chart.renderTo(s.target);
                this._charts.push(chart);
                this._notRenderedSpecs.splice(i, 1);
                i--;
            }
        }
    };

    DevApp.prototype._initUI = function () {
        var settings = this._settings;

        //
        // Init file path input

        var pathInput = document.getElementById('inputPath');
        pathInput.value = settings.path;
        pathInput.focus();

        //
        // Init checkboxes

        var createCheckbox = function (name) {
            var node = createElement(
                '<label><input type="checkbox" value="{{name}}"/>{{name}}</label>',
                {name: name}
            );
            return {
                node: node,
                input: node.querySelector('input')
            };
        };

        var createCheckGroup = function (container, items, checkedItems) {
            var all = createCheckbox('all');
            if (items.every(function (t) {
                return checkedItems.indexOf(t) >= 0;
            })) {
                all.input.checked = true;
            }
            container.appendChild(all.node);
            var checkboxes = items.map(function (t) {
                var c = createCheckbox(t);
                if (checkedItems.indexOf(t) >= 0) {
                    c.input.checked = true;
                }
                container.appendChild(c.node);
                return c;
            });
            container.addEventListener('change', function (e) {
                if (e.target === all.input) {
                    // Check/uncheck all checkboxes
                    checkboxes.forEach(function (c) {
                        c.input.checked = all.input.checked;
                    });
                } else {
                    // Check/uncheck "all" checkbox
                    all.input.checked = checkboxes.every(function (c) {
                        return c.input.checked;
                    });
                }
            });
        };

        var typesContainer = document.getElementById('typesContainer');
        createCheckGroup(typesContainer, TYPES, settings.types);

        var pluginsContainer = document.getElementById('pluginsContainer');
        createCheckGroup(pluginsContainer, PLUGINS, settings.plugins);

        //
        // Init chart size inputs

        var widthInput = document.getElementById('inputWidth');
        var heightInput = document.getElementById('inputHeight');
        widthInput.value = settings.width;
        heightInput.value = settings.height;

        //
        // Handle input changes

        var onValueChanged = function (e) {
            var getValues = function (container) {
                return select(container, 'input').filter(function (el) {
                    return (el.value !== 'all' &&
                        el.checked === true);
                }).map(function (el) {
                    return el.value;
                });
            };
            var settings = {
                path: pathInput.value.trim(),
                types: getValues(typesContainer),
                plugins: getValues(pluginsContainer),
                width: widthInput.value.trim(),
                height: heightInput.value.trim()
            };
            this._settings = settings;
            this._saveSettings(settings);
            this._renderCharts();
        }.bind(this);

        var listenTextChange = function (input) {
            input.onchange = onValueChanged;
            input.onkeydown = function (e) {
                if (e.keyCode === 13) {
                    onValueChanged(e);
                }
            };
        };

        listenTextChange(pathInput);
        typesContainer.addEventListener('change', onValueChanged);
        pluginsContainer.addEventListener('change', onValueChanged);
        listenTextChange(widthInput);
        listenTextChange(heightInput);

        //
        // Init scroll

        if (LAZY_RENDERING) {
            window.addEventListener('resize', this._renderVisibleCharts.bind(this));
            document.getElementById('samplesContainer')
                .addEventListener('scroll', this._renderVisibleCharts.bind(this));
        }
    };

    DevApp.prototype._reportFilterResult = function (filtered, total) {
        document.getElementById('filterText').textContent = (
            'Showing ' + filtered + ' of ' + total + ' charts'
        );
    };

    DevApp.prototype._loadSettings = function () {
        var settings;
        try {
            settings = parseURIQuery(window.location.hash.replace(/^#/, '').replace(/^\?/, ''));
        } catch (err) {
            settings = {};
        }
        if (!(settings instanceof Object)) {
            settings = {};
        }
        settings = utils.defaults(settings, {
            path: '',
            types: [],
            plugins: [],
            width: '',
            height: ''
        });
        settings.path = settings.path.trim();
        settings.types = filterEmptyValues(settings.types);
        settings.plugins = filterEmptyValues(settings.plugins);
        return settings;
    };

    DevApp.prototype._saveSettings = function (settings) {
        settings.path = settings.path.trim();
        settings.types = filterEmptyValues(settings.types);
        settings.plugins = filterEmptyValues(settings.plugins);
        window.location.hash = '#' + stringifyURIQuery(settings);
    };


    function DatasetLoader(name, filter) {
        this.name = name;
        this._filter = filter;
    }
    DatasetLoader.prototype.filter = function (data) {
        if (this._filter) {
            return this._filter.call(null, data);
        }
        return data;
    };


    /**
     * Start app.
     */
    window.addEventListener('load', function () {
        window.dev = new DevApp(PATHS);
        window.utils = utils;
    });


    //------------------------------------------
    //              HELPERS
    //------------------------------------------

    function createElement(templateString, props) {
        if (Array.isArray(templateString)) {
            templateString = templateString.join('\n');
        }
        var htmlString;
        if (props) {
            htmlString = templateString.replace(/\{\{(.+?)\}\}/g, function (m0, m1) {
                return String(props[m1]);
            });
        } else {
            htmlString = templateString;
        }
        var div = document.createElement('div');
        div.innerHTML = htmlString;
        return div.firstElementChild;
    }

    function getJSPaths(path, left, accumulator) {
        accumulator = accumulator || [];
        left = left || '';
        if (typeof path === 'string') {
            var p = left + path;
            if (p.toLowerCase().lastIndexOf('.js') !== p.length - 3) {
                p += '.js';
            }
            accumulator.push(p);
        } else if (Array.isArray(path)) {
            path.forEach(function (p) {
                getJSPaths(p, left, accumulator);
            });
        } else {
            for (var p in path) {
                getJSPaths(path[p], left + p, accumulator);
            }
        }
        return accumulator;
    }

    function filterEmptyValues(arr) {
        if (!Array.isArray(arr)) {
            arr = [arr];
        }
        return arr.map(function (d) {
            return d.trim();
        }).filter(function (d) {
            return Boolean(d);
        });
    }

    function fileRange(prefix, numbers) {
        numbers = Array.prototype.slice.call(arguments, 1);
        return utils.flatten(numbers).map(function (num) {
            num = '00' + String(num);
            num = num.substring(num.length - 3);
            return prefix + num;
        });
    }

    function range(start, end) {
        var arr = [];
        for (var i = start; i <= end; i++) {
            arr.push(i);
        }
        return arr;
    }

    function select(container, selector) {
        return Array.prototype.slice.call(
            container.querySelectorAll(selector), 0
        );
    }

    var WeakMap = window.WeakMap || (function () {
        var counter = 0;
        function WeakMap() {
            this.id = 'WeakMap' + counter++;
        }
        WeakMap.prototype.has = function (key) {
            return this.id in key;
        };
        WeakMap.prototype.get = function (key) {
            return key[this.id];
        };
        WeakMap.prototype.set = function (key, value) {
            Object.defineProperty(key, this.id, {
                configurable: true, value: value
            });
        };
        WeakMap.prototype.delete = function (key) {
            delete key[this.id];
        };
        return WeakMap;
    })();

    function deepClone(src, refs) {
        if (typeof src !== 'object' || src === null) {
            return src;
        }
        refs = refs || new WeakMap();
        if (refs.has(src)) {
            return refs.get(src);
        }
        var result;
        if (Array.isArray(src)) {
            result = [];
            refs.set(src, result);
            src.forEach(function (d) {
                result.push(deepClone(d, refs));
            });
        } else if (src instanceof Date) {
            result = new Date(src.getTime());
            refs.set(src, result);
        } else if (src instanceof Node) {
            result = src.cloneNode(true);
            refs.set(src, result);
        } else if (src instanceof String || src instanceof Boolean || src instanceof Number) {
            var Ctor = Object.getPrototypeOf(src).constructor;
            result = new Ctor(src);
            refs.set(src, result);
        } else {
            Ctor = Object.getPrototypeOf(src).constructor;
            result = new Ctor();
            refs.set(src, result);
            Object.setPrototypeOf(result, Object.getPrototypeOf(src));
            var props = Object.getOwnPropertyNames(src);
            for (var i = 0, dtor, len = props.length; i < len; i++) {
                dtor = Object.getOwnPropertyDescriptor(src, props[i]);
                if ('value' in dtor) {
                    dtor.value = deepClone(dtor.value, refs);
                }
                Object.defineProperty(result, props[i], dtor);
            }
        }
        return result;
    }

    function stringifyURIQuery(obj) {
        var params = [];
        Object.keys(obj).forEach(function (key) {
            var values = Array.isArray(obj[key]) ? obj[key] : [obj[key]];
            values.filter(function (value) {
                return value !== '';
            }).forEach(function (value) {
                params.push({
                    key: key,
                    value: encodeURIComponent(value)
                });
            });
        });
        var query = (params.length > 0 ? '?' : '') +
            params.map(function (p) {
                return p.key + '=' + p.value;
            }).join('&');
        return query;
    }

    function parseURIQuery(query) {
        var obj = {};
        var parts = query.split('&');
        parts.forEach(function (p) {
            var param = p.split('=');
            var key = param[0];
            var value = decodeURIComponent(param[1]);
            if (!(key in obj)) {
                obj[key] = value;
            } else if (!Array.isArray(obj[key])) {
                obj[key] = [obj[key], value];
            } else {
                obj[key].push(value);
            }
        });
        return obj;
    }

})();
