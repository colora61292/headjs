/**
    Head JS     The only script in your <HEAD>
    Copyright   Tero Piirainen (tipiirai)
    License     MIT / http://bit.ly/mit-license
    Version     0.97a

    http://headjs.com
*/
;(function(win, undefined) {
    "use strict";

    var doc        = win.document,
        nav        = win.navigator,
        html       = doc.documentElement,
        domWaiters = [],
        queue      = [], // waiters for the "head ready" event
        handlers   = {}, // user functions waiting for events
        scripts    = {}, // loadable scripts in different states
        isAsync    = doc.createElement("script").async === true || "MozAppearance" in doc.documentElement.style || win.opera,
        isHeadReady,
        isDomReady,

        /*** public API ***/
        head_var = win.head_conf && win.head_conf.head || "head",
        api      = win[head_var] = (win[head_var] || function() { api.ready.apply(null, arguments); }),

        // states
        PRELOADED  = 1,
        PRELOADING = 2,
        LOADING    = 3,
        LOADED     = 4;

    // Method 1: simply load and let browser take care of ordering
    if (isAsync) {

        api.js = function() {

            var args = arguments,
                 fn  = args[args.length - 1],
                 els = {};

            if (!isFunc(fn)) {
                fn = null;
            }

            each(args, function(el, i) {

                if (el != fn) {
                    el = getScript(el);
                    els[el.name] = el;

                    load(el, fn && i == args.length - 2 ? function () {
                        if (allLoaded(els)) {
                            one(fn);
                        }

                    } : null);
                }
            });

            return api;
        };


    // Method 2: preload with text/cache hack
    } else {

        api.js = function() {

            var args = arguments,
                rest = [].slice.call(args, 1),
                next = rest[0];

            // wait for a while. immediate execution causes some browsers to ignore caching
            if (!isHeadReady) {
                queue.push(function()  {
                    api.js.apply(null, args);
                });
                
                return api;
            }

            // multiple arguments
            if (next) {

                // load
                each(rest, function(el) {
                    if (!isFunc(el)) {
                        preload(getScript(el));
                    }
                });

                // execute
                load(getScript(args[0]), isFunc(next) ? next : function() {
                    api.js.apply(null, rest);
                });


            // single script
            }
            else {
                load(getScript(args[0]));
            }

            return api;
        };
    }

    api.ready = function(key, fn) {
       
        // DOM ready check: head.ready(document, function() { });
        if (key == doc) {
            if (isDomReady) {
                one(fn);
            }
            else {
                domWaiters.push(fn);
            }
            
            return api;
        }

        // shift arguments
        if (isFunc(key)) {
            fn  = key;
            key = "ALL";
        }    

        // make sure arguments are sane
        if (typeof key != 'string' || !isFunc(fn)) {
            return api;
        }

        var script = scripts[key];
        
        // script already loaded --> execute and return
        if (script && script.state == LOADED || key == 'ALL' && allLoaded() && isDomReady) {
            one(fn);
            return api;
        }

        var arr = handlers[key];
        if (!arr) {
            arr = handlers[key] = [fn];
        }
        else {
            arr.push(fn);
        }
        
        return api;
    };


    // perform this when DOM is ready
    api.ready(doc, function() {

        if (allLoaded()) {
            each(handlers.ALL, function (fn) {
                one(fn);
            });
        }

        if (api.feature) {
            api.feature("domloaded", true);
        }
    });


    /*** private functions ***/
    
    
    // call function once
    function one(fn) {
        if (fn._done) { return; }
        fn();
        fn._done = 1;
    }


    function toLabel(url) {
        var els   = url.split("/"),
             name = els[els.length -1],
             i    = name.indexOf("?");

        return i != -1 ? name.substring(0, i) : name;
    }


    function getScript(url) {

        var script;

        if (typeof url == 'object') {
            for (var key in url) {
                if (url[key]) {
                    script = { name: key, url: url[key] };
                }
            }
        }
        else {
            script = { name: toLabel(url),  url: url };
        }

        var existing = scripts[script.name];
        if (existing && existing.url === script.url) {
            return existing;
        }

        scripts[script.name] = script;
        return script;
    }


    function each(arr, fn) {
        if (!arr) {
            return;
        }

        // arguments special type
        if (typeof arr == 'object') {
            arr = [].slice.call(arr);
        }

        // do the job
        for (var i = 0; i < arr.length; i++) {
            fn.call(arr, arr[i], i);
        }
    }

    function isFunc(el) {
        return Object.prototype.toString.call(el) == '[object Function]';
    }

    function allLoaded(els) {
       
        els = els || scripts;       

        var loaded = false;
        
        for (var name in els) {
            if (els.hasOwnProperty(name) && els[name].state != LOADED) {
                return false;
            }
            
            loaded = true;
        }
        
        return loaded;
    }


    function onPreload(script) {
        script.state = PRELOADED;

        each(script.onpreload, function(el) {
            el.call();
        });
    }

    function preload(script, callback) {
        
        if (script.state === undefined) {

            script.state     = PRELOADING;
            script.onpreload = [];

            scriptTag({ src: script.url, type: 'cache'}, function()  {
                onPreload(script);
            });
        }
    }

    function load(script, callback) {
        if (script.state == LOADED) {
            return callback && callback();
        }

        if (script.state == LOADING) {
           return api.ready(script.name, callback);
        }

        if (script.state == PRELOADING) {
            return script.onpreload.push(function() {
                load(script, callback);
            });
        }

        script.state = LOADING;

        scriptTag(script.url, function() {

            script.state = LOADED;

            if (callback) {
                 callback();
            }

            // handlers for this script
            each(handlers[script.name], function (fn) {
                one(fn);
            });

            // everything ready
            if (allLoaded() && isDomReady) {
                each(handlers.ALL, function (fn) {
                    one(fn);
                });
            }
        });
    }


    function scriptTag(src, callback) {
        var s   = doc.createElement('script');
        s.type  = 'text/' + (src.type || 'javascript');
        s.src   = src.src || src;
        s.async = false;

        // code inspired from: https://github.com/unscriptable/curl/blob/master/src/curl.js
        s.onload  = s.onreadystatechange = process;
        s.onerror = error;

        function error(er) {
            // need some error handling here !
            
            // release event listeners
            s.onload = s.onreadystatechange = s.onerror = null;
        }
        
        function process(event) {
            event = event || win.event;
            
            // IE 7-9 will trigger 1 s.readyState (1: complete)
            // IE 10  will trigger 2 s.readyState (1: loaded, 2: complete)
            // All other browsers seem trigger 1 event.type (1: load)
            if (event.type == 'load' || /complete/.test(s.readyState)) {
                // release event listeners
                s.onload = s.onreadystatechange = s.onerror = null;
                callback();
            }
        };

        // use insertBefore to keep IE from throwing Operation Aborted (thx Bryan Forbes!)
        var head = doc['head'] || doc.getElementsByTagName('head')[0];
        // but insert at end of head, because otherwise if it is a stylesheet, it will not ovverride values
        head.insertBefore(s, head.lastChild);
    }

    /*
        The much desired DOM ready check
        Thanks to jQuery and http://javascript.nwbox.com/IEContentLoaded/
    */

    function fireReady() {
        if (!isDomReady) {
            isDomReady = true;
            each(domWaiters, function(fn) {
                one(fn);
            });
        }
    }

    // W3C
    if (win.addEventListener) {
        doc.addEventListener("DOMContentLoaded", fireReady, false);

        // fallback. this is always called
        win.addEventListener("load", fireReady, false);

    // IE
    } else if (win.attachEvent) {

        // for iframes
        doc.attachEvent("onreadystatechange", function()  {
            if (doc.readyState === "complete" ) {
                fireReady();
            }
        });


        // avoid frames with different domains issue
        var frameElement = 1;

        try {
            frameElement = win.frameElement;

        } catch(e) {}


        if (!frameElement && html.doScroll) {

            (function() {
                try {
                    html.doScroll("left");
                    fireReady();

                } catch(e) {
                    setTimeout(arguments.callee, 1);
                    return;
                }
            })();
        }

        // fallback
        win.attachEvent("onload", fireReady);
    }


    // enable document.readyState for Firefox <= 3.5
    if (!doc.readyState && doc.addEventListener) {
        doc.readyState = "loading";
        doc.addEventListener("DOMContentLoaded", handler = function () {
            doc.removeEventListener("DOMContentLoaded", handler, false);
            doc.readyState = "complete";
        }, false);
    }

    /*
        We wait for 300 ms before script loading starts. for some reason this is needed
        to make sure scripts are cached. Not sure why this happens yet. A case study:

        https://github.com/headjs/headjs/issues/closed#issue/83
    */
    setTimeout(function() {
        isHeadReady = true;
        each(queue, function(fn) {
            fn();
        });

    }, 300);

})(window);