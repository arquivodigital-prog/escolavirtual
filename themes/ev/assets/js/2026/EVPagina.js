'use strict';

/*
    Global state
*/

var EscolaVirtual = {
    // Progressive enhancement:
    HTMLInertSupport: "inert" in HTMLElement.prototype,
    JSIntersectionObserverSupport: 'IntersectionObserver' in window,
    JSResizeObserverSupport : 'ResizeObserver' in window,
    DOMGetAnimationsSupport: "getAnimations" in HTMLElement.prototype,
    outsideInertSelector: `body > *:not(dialog, script, noscript, iframe, .ev-dialognovo-visiveis, .ev-dialognovo.--nao-modal, #ev-header-submenu)`,

    /*
        Elems:
    */
    topSticky: document.querySelector(".ev-top-sticky"),
    subMenuAberto: false,

    /*
        Classes comuns
    */

    /** @type {DialogManager | null} */
    dialogManager: null,
    /** @type {EVPagina | null} */
    pagina: null,
}

/*
    Helpers
*/

function TogglePageScroll(newState) {
    return newState ? document.body.classList.add("scroll-disabled") : document.body.classList.remove("scroll-disabled");
}

function SetInert(els, newState, options = {
    mode: "inert", /* ou "tabindex" ou "aria-hidden" */
}) {
    ConsoleLog(`TabIndex is ${options.tabindexOnly}`);
    if (EscolaVirtual.HTMLInertSupport && options.mode === "inert") {
        els.forEach((el, elIndex) => {
            if (el instanceof Element) {
                if (typeof newState === "boolean") {
                    return !newState ? el.removeAttribute("inert") : el.setAttribute("inert", "");
                } else {
                    if (newState.true.includes(elIndex) && newState.false.includes(elIndex)) {
                        throw new Error(`[SetInert'] Index de item declarado tanto falso como verdadeiro`); 
                    } else {
                        if (newState.true.includes(elIndex) || newState.true === "remaining" && !newState.false.includes(elIndex)) {
                            el.setAttribute("inert", "");
                        }
                        else if (newState.false.includes(elIndex) || newState.false === "remaining" && !newState.true.includes(elIndex)) {
                            el.removeAttribute("inert");
                        }
                    }
                }
            }
        });
    } else {
        // Set tabindex
        els.forEach((el, elIndex) => {
            if (el instanceof Element) {
                const elFocusables = el.querySelectorAll('a, button, input, textarea, select, [tabindex]');
                elFocusables.forEach((focusable) => {
                    if (focusable instanceof Element) {
                        if (typeof newState === "boolean") {
                            return !newState ? focusable.tabIndex = -1 : focusable.tabIndex = 0;
                        } else {
                            if (newState.true.includes(elIndex) && newState.false.includes(elIndex)) {
                                throw new Error(`[SetInert'] Index de item declarado tanto falso como verdadeiro`); 
                            } else {
                                if (newState.true.includes(elIndex) || newState.true === "remaining" && !newState.false.includes(elIndex)) {
                                    focusable.tabIndex = -1;
                                }
                                else if (newState.false.includes(elIndex) || newState.false === "remaining" && !newState.true.includes(elIndex)) {
                                    focusable.tabIndex = 0;
                                }
                            }
                        }
                    }
                });
            }
        });

        if (options.mode === "aria-hidden")  {
            els.forEach((el, elIndex) => {
                if (el instanceof Element) {
                    if (typeof newState === "boolean") {
                        return !newState ? el.removeAttribute("aria-hidden") : el.setAttribute("aria-hidden", "true");
                    } else {
                        if (newState.true.includes(elIndex) && newState.false.includes(elIndex)) {
                            throw new Error(`[SetInert'] Index de item declarado tanto falso como verdadeiro`); 
                        } else {
                            if (newState.true.includes(elIndex) || newState.true === "remaining" && !newState.false.includes(elIndex)) {
                                el.setAttribute("aria-hidden", "true");
                            }
                            else if (newState.false.includes(elIndex) || newState.false === "remaining" && !newState.true.includes(elIndex)) {
                                el.removeAttribute("aria-hidden");
                            }
                        }
                    }
                }
            });
        }
    }
}

function ConsoleLog(logContent) {
    const debug = true;
    if (debug) return console.log(logContent);
};

/**
 * Build a human-readable element descriptor, e.g.:
 * "button#submit.primary.large[type='button']:nth-of-type(2)"
 * Falls back gracefully when id/classes/attrs are missing.
 */
function GetElementDescription(el) {
    function nthOfType(el) {
    if (!el.parentElement) return '';
    const tag = el.tagName;
    let index = 0;
    for (const child of el.parentElement.children) {
        if (child.tagName === tag) index++;
        if (child === el) break;
    }
    // Only add if thereâ€™s more than one of this type under the parent
    const count = [...el.parentElement.children].filter(c => c.tagName === tag).length;
    return count > 1 ? `:nth-of-type(${index})` : '';
    }

    function cssEscape(text) {
    // Minimal escape for id/class tokens (spec-compliant escape is more involved)
    return String(text).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
    }

    function attrValue(val) {
    // Trim length for very long attributes to keep messages readable
    const s = String(val);
    return s.length > 60 ? `${s.slice(0, 57)}â€¦` : s;
    }

    if (!el || el.nodeType !== 1) return String(el); // handle null, text, etc.

    const tag = el.tagName?.toLowerCase?.() || 'unknown';

    // Prefer an id if itâ€™s present
    const id = el.id ? `#${cssEscape(el.id)}` : '';

    // Include a few classes (but not all, to avoid noise)
    const classes = (el.classList?.length ? [...el.classList]
        .slice(0, 3) // cap at 3 classes for readability
        .map(c => `.${cssEscape(c)}`)
        .join('') : '');

    // Add a small set of discriminating attributes if present
    const interestingAttrs = ['type', 'name', 'role', 'data-testid', 'aria-label'];
    const attrs = interestingAttrs
        .filter(a => el.hasAttribute?.(a))
        .map(a => `[${a}='${attrValue(el.getAttribute(a))}']`)
        .join('');

    // Use nth-of-type to disambiguate siblings with same tag
    const nth = nthOfType(el);

    return `${tag}${id}${classes}${attrs}${nth}`;
}

/*
    Accordion
*/

class Accordion {
    constructor(selector, userOptions) {
        /*
        User options:
        {
            onStateChange: (newState) => void
        }
        */
        let btn = null;
        let content = null;
        let init = false;
        let open = false;
        this.getState = () => open;

        // "selector" pode ser:
        // - string
        // - elemento HTML com classe ".ev-accordion" (facilita-nos as coisas na classe AccordionGroup)
        const element = selector instanceof HTMLElement ? selector : document.querySelector(selector);

        // VerificaÃ§Ã£o de erros:
        if (element instanceof HTMLElement) {
            if (!element.classList.contains("ev-accordion")) {
                throw new Error(`[Accordion] Elemento nÃ£o contÃ©m classe .ev-accordion`);
            } else {
                btn = element.querySelector(".ev-accordion-btn");
                content = element.querySelector(".ev-accordion-content");

                if (!btn) throw new Error(`[Accordion] NÃ£o existe nenhum botÃ£o vÃ¡lido para esta instÃ¢ncia`);
                else if (!content) throw new Error(`[Accordion] NÃ£o existe nenhuma lista de conteÃºdos vÃ¡lida para esta instÃ¢ncia`);
                else if (btn instanceof HTMLElement && content instanceof HTMLElement) {
                    if (content.id === "") {
                        throw new Error(`[Accordion ${this.selector}] A lista de items precisa de ter um ID definido`);
                    } else if (btn.id === "") {
                        throw new Error(`[Accordion ${this.selector}] O botÃ£o precisa de ter um ID definido`);
                    } else {
                        // InicializaÃ§Ã£o:
                        this.setTo = (newState) => {
                            open = newState;
                            btn.setAttribute("aria-expanded", open);

                            // Inert-iza (ou nÃ£o) o conteÃºdo do accordion:
                            SetInert([content], !newState);

                            //
                            if (init) userOptions?.onStateChange?.(open);
                            else init = true;
                        };
                        content.setAttribute("role", "region");
                        content.setAttribute("aria-labelledby", btn.id);
                        btn.setAttribute("aria-controls", content.id);
                        btn.addEventListener("click", () => {
                            this.setTo(!open);
                        });

                        // Estado inicial
                        this.setTo(open);
                    }
                } else {
                    throw new Error(`[Accordion] Elementos de botÃ£o e/ou lista de conteÃºdos invÃ¡lidos`);
                }
            }
        } else {
            throw new Error(`[Accordion] Nenhum elemento encontrado com este seletor`);
        }
    }
}

class AccordionGroup {
    constructor(group, userOptions) {
        const defaultOptions = {
            onlyOneOpen: false
        };
        const options = {...defaultOptions, ...userOptions};

        // VerificaÃ§Ã£o de erros:
        let accordionElems = [];
        let accordionInstances = [];
        let groupState = null; // Index number em modo "onlyOneOpen". Caso contrÃ¡rio, boolean[]

        const updateGroupState = (updatedIndex) => {
            if (options.onlyOneOpen) {
                const updatedIndexIsOpen = accordionInstances[updatedIndex].getState();
                if (groupState === updatedIndex && !updatedIndexIsOpen) groupState = -1;
                else {
                    if (groupState !== -1) accordionInstances[groupState].setTo(false);
                    if (updatedIndexIsOpen) groupState = updatedIndex;
                }
            } else {
                groupState[updatedIndex] = accordionInstances[updatedIndex].getState();
            }
        };

        let groupElem = document.querySelector(group);
        if (groupElem instanceof HTMLElement) {
            accordionElems = [...groupElem.querySelectorAll(".ev-accordion")];
            if (accordionElems.length > 0) {
                if (options.onlyOneOpen) groupState = -1;
                else groupState = new Array(accordionElems.length).fill(null);

                // Instanciar accordions:
                accordionElems.forEach((elem, elemIndex) => {
                    try {
                        accordionInstances.push(new Accordion(
                            elem, {
                                onStateChange: () => updateGroupState(elemIndex)
                            }
                        ));
                    }
                    catch (e) {
                        console.error(`[AccordionGroup '${group}'] NÃ£o foi possÃ­vel instanciar Accordion para o item ${elemIndex}. Log de erro:`);
                        throw e;
                    }
                });

                // InicializaÃ§Ã£o:
                this.closeAll = () => {
                    if (options.onlyOneOpen && groupState !== -1) accordionInstances[groupState].setTo(false);
                    else if (!options.onlyOneOpen) {
                        accordionInstances.forEach(inst => inst.setTo(false));
                    }
                }
            } else {
                throw new Error(`[AccordionGroup '${group}'] Nenhum elemento .ev-accordion encontrado`);
            }
        } else {
            throw new Error(`[AccordionGroup '${group}'] Nenhum grupo de accordions encontrado`);
        }
    }
}

/*
    Carousel
*/


class Carousel {
    constructor(selector, userOptions) {
        const defaultOptions = {

            /////////////////////////////////////////////////////
            // ObrigatÃ³rio o desenvolvedor preencher estas opÃ§Ãµes
            /////////////////////////////////////////////////////

            /*
            OpÃ§Ã£o de reproduzir os slides?

            OpÃ§Ãµes vÃ¡lidas:
            - "auto": Autoplay
            - true: BotÃ£o play aparece, sem autoplay do carrossel.
            - false
            */
            play: null,

            ///////////
            // Opcional
            ///////////

            defaultSlideDuration: 10000,
            startWithIndex: 0,

            /*
            */

            inertMode: "inert",

            /*
            Ãštil quando precisamos de separar o container com
            os controlos do container com os items (exemplo: Home)
            */

            customSelectors: {
                controls: null
            },
            group: null
        };
        let options = {...defaultOptions, ...userOptions};
        this.options = () => options; // Getter

        this.state = {
            selector,
            element: null,
            entriesContainer: null,
            entries: [],
            controlContainer: null,
            controlContainerFocused: false,
            controls: [],
            prevIndex: -1,
            currIndex: -1,
            play: {
                button: null,
                playing: options.play === "auto",
                /* Timeout */
                timeout: null,
                timeoutStart: 0,
                timeoutFullDuration: 0,
                timeoutAppliedDuration: 0, // SubtraÃ­ndo tempo de pausa
                timeoutPause: 0,
            },
            init: false,
        };

        const setupControlsContainer = () => {
            function HandleTabControlKeys(event) {
                function UndefaultEvent() {
                    event.stopPropagation();
                    event.preventDefault();
                }

                if (this.state.controlContainerFocused) {
                    switch (event.key) {
                        case 'ArrowRight':
                            this.switchToEntry(
                                this.state.currIndex + 1 < this.state.entries.length
                                ? this.state.currIndex + 1 : this.state.currIndex
                            );
                            UndefaultEvent();
                            break;

                        case 'ArrowLeft':
                            this.switchToEntry(
                                this.state.currIndex - 1 < 0
                                ? 0 : this.state.currIndex - 1
                            );
                            UndefaultEvent()
                            break;

                        default:
                            break;
                    }
                }
            }

            this.createControls(HandleTabControlKeys);
        }

        const createControlsContainer = () => {
            this.state.controlContainer = document.createElement("div");
            this.state.controlContainer.classList.add("ev-carousel-controls");
            setupControlsContainer();
            this.state.element.append(this.state.controlContainer);
        };

        // InicializaÃ§Ã£o:
        this.state.element = document.querySelector(selector);
        if (this.state.element instanceof HTMLElement) {
            this.state.entriesContainer = this.state.element.querySelector('.ev-carousel-items');
            if (this.state.entriesContainer instanceof HTMLElement) {
                this.state.entries = [...this.state.entriesContainer.querySelectorAll('.ev-carousel-entry')];
                if (this.state.entries.length > 0) {
                    // Inicializar elementos de controlo (tabs ou setas):
                    if (options.customSelectors.controls) {
                        this.state.controlContainer = document.querySelector(options.customSelectors.controls);
                        if (this.state.controlContainer instanceof HTMLElement) {
                            if (!this.state.controlContainer.classList.contains("ev-carousel-controls")) {
                                throw new Error(`[Carousel '${this.state.selector}'] Elemento customizado para barra de controlo nÃ£o tem classe 'ev-carousel-controls`);
                            } else {
                                setupControlsContainer();
                            }
                        } else createControlsContainer();
                    } else {
                        this.state.controlContainer = this.state.element.querySelector(".ev-carousel-controls");
                        if (!this.state.controlContainer) {
                            createControlsContainer();
                        } else if (this.state.controlContainer instanceof HTMLElement) {
                            setupControlsContainer();
                        }
                    }

                    // Inicializar elementos de reproduÃ§Ã£o do carrossel:
                    if (options.play === "auto" || options.play === true) {
                        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                            // Caso o utilizador tenha desativado quaisquer animaÃ§Ãµes no browser,
                            // tambÃ©m desativamos o autoplay:
                            if (this.state.play.playing) this.state.play.playing = false;
                        }
                        this.state.play.button = this.state.element.querySelector(".ev-carousel-play");
                        if (!this.state.play.button) {
                            throw new Error(`[Carousel '${this.state.selector}'] Elemento de botÃ£o play nÃ£o encontrado`);
                        } else {
                            // Estado inicial
                            this.state.play.buttonUpdate = () => {
                                this.state.play.button.setAttribute("aria-pressed", this.state.play.playing);
                            }
                            this.state.play.buttonUpdate();
                            this.state.play.button.classList.add("ev-carousel-play-enabled");

                            // Eventos de interaÃ§Ã£o
                            this.state.play.button.addEventListener("click", () => {
                                this.state.play.playing ? this.pause() : this.play();
                            });
                            // Assegurar que o focus dentro do carrossel pausa a reproduÃ§Ã£o
                            // Uma vez que o clique no botÃ£o move o focus para dentro do
                            // carrossel, os eventos de clique do botÃ£o de reproduÃ§Ã£o e 
                            // "focusin" podem entrar em conflito.
                            this.state.play.button.addEventListener("pointerdown", () => {
                                this.state.play.buttonBeingPressed = true;
                            });
                            this.state.play.button.addEventListener("pointerup", () => {
                                this.state.play.buttonBeingPressed = false;
                            });
                            this.state.element.addEventListener('focusin', () => {
                                if (!this.state.play.buttonBeingPressed) this.pause();
                            });
                            this.state.controlContainer.addEventListener('focusin', () => {
                                /*
                                    Se o utilizador fizer tab para um "control container" que
                                    esteja desassociado da caixa HTML que contÃ©m o carrossel
                                    (p.ex. index destaques), o focusin acima nÃ£o funcionarÃ¡
                                    sem isto.
                                */
                                if (!this.state.play.buttonBeingPressed) this.pause();
                            });
                        }
                    } else if (options.play !== false) {
                        throw new Error(`[Carousel '${this.state.selector}'] OpÃ§Ã£o "play" nÃ£o se encontra definida`);
                    }

                    ConsoleLog(`[Carousel '${this.state.selector}'] Inicializado`);
                } else {
                    throw new Error(`[Carousel '${this.state.selector}'] Nenhum item encontrado`);
                }
            } else {
                throw new Error(`[Carousel '${this.state.selector}'] Nenhuma caixa de items encontrada`);
            }
        } else {
            if (this.options().errorHandling === "strict") {
                throw new Error(`[Carousel '${this.state.selector}'] Nenhum elemento encontrado com este seletor`);
            }
        }
    }

    switchToEntry(index) {
        if (this.state.currIndex !== index) {
            this.state.prevIndex = this.state.prevIndex === -1 ? index : this.state.currIndex;
            this.state.currIndex = index;
        }

        this.updateView();

        // Try to only set inert after view is updated:
        switch(this.options().controlType) {
            case "tabs":
                this.state.controls[this.state.prevIndex].setAttribute("aria-selected", "false");
                this.state.controls[this.state.currIndex].setAttribute("aria-selected", "true");

                // Set inert accordingly
                SetInert(this.state.entries, {
                    true: "remaining",
                    false: [this.state.currIndex],
                }, {
                    mode: this.options().inertMode
                });

                break;
            default:
                break;
        }

        //
        if (this.state.play.playing) this.play();
        else this.updateViewPlayElements(); // To reset progress bar
    }

    play() {
        if (this.state.play.timeoutPause) {
            // Caso o slide atual tenha sido pausado, este ciclo de reproduÃ§Ã£o terÃ¡ apenas a duraÃ§Ã£o restante:
            this.state.play.timeoutAppliedDuration = this.state.play.timeoutFullDuration - Math.max(
                this.state.play.timeoutPause - this.state.play.timeoutStart,
                0
            );
            this.state.play.timeoutPause = 0;
        } else {
            // Se o slide tiver o atributo "data-time", a sua duraÃ§Ã£o serÃ¡ customizada:
            const customSlideDuration = Number(this.state.entries[this.state.currIndex].getAttribute("data-time"));
            if (customSlideDuration === NaN) throw new Error(`[Carousel '${this.state.selector}'] Slide ${this.state.currIndex} com valor invÃ¡lido para duraÃ§Ã£o customizada`);

            this.state.play.timeoutFullDuration = !customSlideDuration
                ? this.options().defaultSlideDuration : customSlideDuration;
            this.state.play.timeoutAppliedDuration = this.state.play.timeoutFullDuration;
        }

        // Reproduzir:
        this.state.play.playing = true;
        this.state.play.timeoutStart = Date.now();
        this.state.play.button.setAttribute("aria-pressed", this.state.play.playing);
        this.state.element.setAttribute("aria-live", "polite");
        this.state.play.buttonUpdate();
        this.updateViewPlayElements();
        clearTimeout(this.state.play.timeout); // Terminar timeout anterior (p. ex. slide anterior)
        this.state.play.timeout = setTimeout(() => {
            this.switchToEntry(
                this.state.currIndex + 1 <= (this.state.entries.length - 1) ? this.state.currIndex + 1 : 0
            );
            this.play(); // Play next
        }, this.state.play.timeoutAppliedDuration);
    }

    pause() {
        this.state.play.playing = false;
        this.state.play.timeoutPause = Date.now();
        this.state.element.setAttribute("aria-live", "off");
        this.state.play.buttonUpdate();
        this.updateViewPlayElements();
        clearTimeout(this.state.play.timeout);
    }

    /*
    */

    createControls(keyHandler) {

    }

    handleControlClick() {
        
    }

    initView() {

    }

    updateView() {

    }

    updateViewPlayElements() {

    }

    /*
    */

    init() {
        this.initView();
        //
        let resizeDebouncingTimeout = null;
        clearTimeout(resizeDebouncingTimeout);
        window.addEventListener("resize", () => {
            /*
                Debouncing
            */
            // clear the timeout
            clearTimeout(resizeDebouncingTimeout);
            // start timing for event "completion"
            resizeDebouncingTimeout = setTimeout(
                () => this.updateView(), 100
            );
        });

        this.switchToEntry(this.options().startWithIndex);
        if (this.state.play.playing) this.play(); // Start playing the carousel
    }
}

/* tablist / tabpanels */

class TabsCarousel extends Carousel {
    constructor(selector, options) {
        super(selector, options);
    }

    createControls(keyHandler) {
        // Elemento principal:
        this.state.element.setAttribute("aria-roledescription", "carousel");

         const handleCarouselControlClick = (index) => {
            this.switchToEntry(index);
            this.state.controlContainer.focus();
        }

        // Caixa de controlos:
        if (this.state.entriesContainer instanceof HTMLElement && this.state.controlContainer instanceof HTMLElement) {
            this.state.entries.forEach((entry, entryIndex) => {
                if (entry instanceof HTMLElement) {
                    if (entry.id === "") {
                        throw new Error(`[Carousel '${this.state.selector}'] Item ${entryIndex} nÃ£o tem um ID vÃ¡lido!`);
                    } else {
                        entry.setAttribute("role", "tabpanel");
                        entry.setAttribute("aria-roledescription", "slide");

                        // Create tab for entry:
                        const newTab = document.createElement("button");
                        newTab.setAttribute("role", "tab");
                        newTab.setAttribute("class", "ev-tab");
                        newTab.tabIndex = -1;
                        newTab.setAttribute("aria-label", `Slide ${entryIndex + 1} de ${this.state.entries.length}`);
                        newTab.setAttribute("aria-controls", entry.id);
                        newTab.setAttribute("aria-selected", "false");
                        newTab.addEventListener('click', () => handleCarouselControlClick.bind(this)(entryIndex)); 

                        //
                        this.state.controls.push(newTab);
                        this.state.controlContainer.append(newTab);
                    }
                } else {
                    throw new Error(`
                    [Carousel '${this.state.selector}'] Item ${entryIndex} nÃ£o Ã© HTML
                    ConteÃºdo: ${entry}
                    `);
                }
            });
        }

        this.state.controlContainer.classList.add("ev-carousel-controls-tabs");
        this.state.controlContainer.setAttribute("role", "tablist");
        this.state.controlContainer.tabIndex = 0;
        this.state.controlContainer.addEventListener("focusin", () => {
            this.state.controlContainerFocused = true;
        });
        this.state.controlContainer.addEventListener("focusout", () => {
            this.state.controlContainerFocused = true;
        });

        if (typeof keyHandler === "function") {
            this.state.controlContainer.addEventListener("keydown", (e) => keyHandler.bind(this)(e));
        }
    }
}

class FadeCarousel extends TabsCarousel {
    /*
    "options" deve incluir tambÃ©m:
    presentation: {
        classNames: {
            initial: (string)
            active: (string)
            inactive: (string)
        }
    }
    */
    constructor(selector, options) {
        super(selector, options);
    }

    initView() {
        this.state.presentation = {
            progressBarElement: null,
            progressBarCurrSlide: -1,
        };

        // Cria barra de progresso, se o carrossel for reproduzÃ­vel:
        const playOption = this.options().play;
        if (playOption !== false) {
            this.state.presentation.progressBarElement = document.createElement("div");
            this.state.presentation.progressBarElement.className = "ev-carousel-play-progressBar";
            this.state.presentation.progressBarElement.setAttribute("aria-hidden", "true");
            if (this.state.element instanceof HTMLElement) {
                this.state.element.insertBefore(this.state.presentation.progressBarElement, this.state.entriesContainer);
            }
        }
    }

    updateView() {
        // Classes para os slides
        if (!this.options().presentation.classNames) {
            throw new Error(`[FadeCarousel ${this.state.selector}] NÃ£o foram definidas classes`);
        } else {
            if (this.state.prevIndex !== -1) {
                this.state.entries[this.state.prevIndex].classList.remove(this.options().presentation.classNames.active);
            }
            this.state.entries[this.state.currIndex].classList.add(this.options().presentation.classNames.active);
        }
    }

    updateViewPlayElements() {
        // ManipulaÃ§Ã£o da barra de progresso:
        if (this.state.presentation.progressBarElement instanceof HTMLElement) {
            if (this.state.play.playing) {
                // Se slide novo:
                if (this.state.presentation.progressBarCurrSlide !== this.state.currIndex) {
                    requestAnimationFrame(() => {
                        this.state.presentation.progressBarElement.classList.remove(
                            "ev-carousel-play-progressBarAnim", "ev-carousel-play-progressBarAnim-running"
                        );
                        this.state.presentation.progressBarElement.style.animationDuration = `${this.state.play.timeoutAppliedDuration}ms`;
                        requestAnimationFrame(() => {
                            this.state.presentation.progressBarElement.classList.add(
                                "ev-carousel-play-progressBarAnim", "ev-carousel-play-progressBarAnim-running"
                            );
                        })
                    });
                    this.state.presentation.progressBarCurrSlide = this.state.currIndex;
                } else {
                    // New slide that was never reproduced, because prev slide was paused and user
                    // switched to it manually:
                    if (!this.state.presentation.progressBarElement.classList.contains(
                        "ev-carousel-play-progressBarAnim"
                    )) {
                        requestAnimationFrame(() => {
                            this.state.presentation.progressBarElement.style.animationDuration = `${this.state.play.timeoutAppliedDuration}ms`;
                            requestAnimationFrame(() => {
                                this.state.presentation.progressBarElement.classList.add(
                                    "ev-carousel-play-progressBarAnim", "ev-carousel-play-progressBarAnim-running"
                                );
                            })
                        });
                    } else {
                        // Restart slide playing from pause.
                        this.state.presentation.progressBarElement.classList.replace(
                            "ev-carousel-play-progressBarAnim-paused", 
                            "ev-carousel-play-progressBarAnim-running"
                        );
                    }
                }
            } else {
                if (this.state.presentation.progressBarCurrSlide !== this.state.currIndex) {
                    requestAnimationFrame(() => {
                        this.state.presentation.progressBarElement.classList.remove(
                            "ev-carousel-play-progressBarAnim", "ev-carousel-play-progressBarAnim-paused"
                        );
                    });
                    this.state.presentation.progressBarCurrSlide = this.state.currIndex;
                } else {
                    this.state.presentation.progressBarElement.classList.replace(
                        "ev-carousel-play-progressBarAnim-running",
                        "ev-carousel-play-progressBarAnim-paused"       
                    );
                }
            }
        }
    }
}

class SwipeCarousel extends TabsCarousel {
    /*
    "options" pode incluir tambÃ©m:
    presentation: {
        depth: {
            factor: (number)
        }
    }
    */
    constructor(selector, options) {
        super(selector, options);
    }

    initView() {
        // Add important CSS classes for center effect to work:
        if (!this.state.element.classList.contains("ev-carousel-centereffect")) {
            this.state.element.classList.add("ev-carousel-centereffect");
        }
    }

    updateView() {
        let presentationOptions = this.options();
        if (presentationOptions.presentation) {
            presentationOptions = presentationOptions.presentation;
        } else {
            presentationOptions = null;
        }

        /*
            Translates the carousel items container, so that the active
            entry is visually on the horizontal center of the carousel.

            We use the "offsetLeft" and "offsetWidth" of the selected item,
            in order to get layout (a.k.a pre-transform) values.
            The items container can't tell if we are applying CSS transforms
            on the items themselves so, if we used post-transform values,
            the resulting container offset would be incorrect and all over
            the place, especially when each item transform updates whenever
            the active item is changed.
        */
        const selectedItemLeft = this.state.entries[this.state.currIndex].offsetLeft;
        const selectedItemWidth = this.state.entries[this.state.currIndex].offsetWidth;

        // Calculate scroll to center
        const newTranslateX = (selectedItemLeft - (
            this.state.element.clientWidth / 2
        ) + (selectedItemWidth / 2)) * -1;

        // Apply container translation
        this.state.entriesContainer.style.transform = `translateX(${newTranslateX}px)`;

        // If enabled, add depth effect to items surrounding the selected:
        if (presentationOptions && presentationOptions.depth) {
            if (!presentationOptions.depth.factor) {
                throw new Error(`[SwipeCarousel] Fator de profundidade para items nÃ£o-selecionados nÃ£o foi devidamente definido!`);
            }

            function ApplyDepthTransformToEntry(index) {
                const distanceFromSelected = Math.abs(index - this.state.currIndex);
                const entryDepthFactor = (presentationOptions.depth.factor * distanceFromSelected)
                const entryDepth = 1 - entryDepthFactor;

                /*
                    How depth is applied correctly:
                    1.
                */

                // Apply:
                const entry = this.state.entries[index];

                /*
                    When you scale an item, it will appear as if the gaps between items increase
                    exponentially. Transforms don't affect the layout flex gaps. We have to also
                    translate each item, when applying its transform, to fix this.
                */

                return (entry.offsetWidth * entryDepthFactor);
            }

            let accumulatedExtraGaps = 0;
            for (let i = this.state.currIndex; i < this.state.entries.length; i++) {
                console.log(`Index ${i} after ${this.state.currIndex}`);
                accumulatedExtraGaps += ApplyDepthTransformToEntry.bind(this)(i);
            }
            accumulatedExtraGaps = 0;
            for (let j = this.state.currIndex; j >= 0; j--) {
                console.log(`Index ${j} after ${this.state.currIndex}`);
                accumulatedExtraGaps += ApplyDepthTransformToEntry.bind(this)(j);
            }
        }
    }
}

/*
    Navbar
*/

class Navbar {
    opcoesDefault =  {
    };

    active = false;
    selected = -1;
    isKeyboard = false;

    selectors = {
        root: "ev-navbar",
        items: "ev-navbar-items",
        botoes: "ev-navbar-buttons",
        botao: "ev-navbar-btn",
        botaoPrev: "--prev",
        botaoNext: "--next",
        viewport: "ev-navbar-viewport",
        estadoAtivo: "--ativo",
    };

    constructor(selector = `.${this.selectors.root}`) {
        this.elemento = document.querySelector(selector);

        if (this.elemento) {
            if (!this.elemento.classList.contains(this.selectors.root)) {
                throw new Error("[Navbar] Elemento selecionado nÃ£o inclui a classe CSS de raÃ­z");
            }

            this.itemsCaixa = this.elemento.querySelector(`.${this.selectors.items}`);
            this.viewport = this.elemento.querySelector(`.${this.selectors.viewport}`);
            this.botoesCaixa = this.elemento.querySelector(`.${this.selectors.botoes}`);
            this.botaoPrev = this.elemento.querySelector(`.${this.selectors.botao}.${this.selectors.botaoPrev}`);
            this.botaoNext = this.elemento.querySelector(`.${this.selectors.botao}.${this.selectors.botaoNext}`);
            this.items = [...this.itemsCaixa.querySelectorAll('a, button, [tabindex="0"]')];

            if (!this.itemsCaixa) {
                throw new Error("[Navbar] Elemento selecionado nÃ£o inclui um sub-elemento de items vÃ¡lido");
            } 

            /*
            */
            

            if (this.itemsCaixa) {
                if (EscolaVirtual.JSResizeObserverSupport) {
                    this.eventListener = new ResizeObserver(() => {
                        if (this.itemsCaixa) {
                            if (this.active !== this.itemsCaixa.scrollWidth > this.elemento.clientWidth) {
                                this.toggle();
                            };
                        }
                        console.log(this.active);
                    });
                    this.eventListener.observe(this.elemento);
                } else {
                    // Fallback
                    window.addEventListener('resize', () => {
                        if (this.itemsCaixa) {
                            this.active = this.itemsCaixa.scrollWidth > this.elemento.clientWidth;
                        }
                        console.log(this.active);
                    });
                }

                /*
                    Detetar se teclado ou rato, de forma a
                    que as setas acionem corretamente.
                */

                this.viewport.addEventListener("keydown", () => {
                    this.isKeyboard = true;
                });

                /*
                    Assegura que o elemento da lista focado
                    mantÃ©m-se totalmente visÃ­vel no ecrÃ£.
                */
                
                this.itemsCaixa.addEventListener('focusin', (e) => {
                    if (!this.isKeyboard) return;

                    const index = this.items.indexOf(e.target);
                    if (index !== -1) {
                        this.selected = index;
                    }
                    
                    e.target.scrollIntoView({
                        inline: "nearest",
                        block: "nearest"
                    });
                });

                /*
                    Funcionalidade das setas
                */

                this.botaoPrev.tabIndex = -1;
                this.botaoNext.tabIndex = -1;

                this.botaoPrev.addEventListener("mousedown", (e) => {
                    if (this.isKeyboard) {
                        this.isKeyboard = false;
                    }
                    this.viewport.scrollBy({ left: -200, behavior: "smooth" });
                });

                this.botaoNext.addEventListener("mousedown", (e) => {
                    if (this.isKeyboard) {
                        this.isKeyboard = false;
                    }
                    this.viewport.scrollBy({ left: 200, behavior: "smooth" });
                });

                function ShowRightArrows() {
                    const scrollLeft = this.viewport.scrollLeft;
                    const maxScrollLeft = this.viewport.scrollWidth - this.viewport.clientWidth;

                    const epsilon = 1; // tolerance

                    if (scrollLeft <= epsilon) {
                       this.botaoPrev.style.opacity = "0";
                       this.botaoNext.style.opacity = "1";
                    } else if (scrollLeft >= maxScrollLeft - epsilon) {
                       this.botaoPrev.style.opacity = "1";
                       this.botaoNext.style.opacity = "0";
                    } else {
                        this.botaoPrev.style.opacity = "1";
                        this.botaoNext.style.opacity = "1";
                    }
                }

                this.viewport.addEventListener('scroll', () => {
                    ShowRightArrows.bind(this)();
                });
                ShowRightArrows.bind(this)();
            }
        }

    }

    toggle() {
        this.active = !this.active;
        this.elemento.classList.toggle(this.selectors.estadoAtivo);
    }
}

/*
    Custom Select
*/

class CustomSelect {
    constructor(selector, settings) {
        const defaultSettings = {
            options: [],
            onOptionChange: null,
        }

        // element refs
        this.el = document.querySelector(selector);
        if (!this.el instanceof HTMLElement) {
            throw new Error(`[Custom Select] Nenhum elemento encontrado com seletor ${selector}`);
        } else if (!this.el.classList.contains("ev-custom-select")) {
            throw new Error(`[Custom Select "${selector}"] Elemento encontrado nÃ£o tem classe CSS obrigatÃ³ria "ev-custom-select"`);
        } else {
            this.labelEl = this.el.querySelector('.ev-custom-select-label');
            if (!this.labelEl instanceof HTMLElement || this.labelEl.id === "") {
                throw new Error("NO ev-custom-select-LABEL ID");
            }

            //
            this.comboEl = this.el.querySelector('.ev-custom-select-input');
            if (!this.comboEl instanceof HTMLElement || this.comboEl.id === "") {
                throw new Error("NO ev-custom-select-combo ID");
            }
            if (this.comboEl instanceof HTMLElement) {
                this.comboEl.role = "combobox";
                this.comboEl.ariaHasPopup = "listbox";
                this.comboEl.setAttribute("aria-labelledby", this.labelEl.id);
                this.comboEl.ariaExpanded = "false";
                this.comboEl.tabIndex = 0;
            }

            //
            this.listboxEl = this.el.querySelector('.ev-custom-select-menu');
            if (this.listboxEl instanceof HTMLElement) {
                this.listboxEl.role = "listbox";
                this.listboxEl.setAttribute("aria-labelledby", this.labelEl.id);
                this.listboxEl.tabIndex = -1;
            }
        }

        // data
        this.idBase = this.comboEl.id || 'combo';
        this.settings = {...defaultSettings, ...settings};

        // state
        this.activeIndex = 0;
        this.open = false;
        this.searchString = '';
        this.searchTimeout = null;

        // Save a list of named combobox actions, for future readability
        this.SelectActions = {
            Close: 0,
            CloseSelect: 1,
            First: 2,
            Last: 3,
            Next: 4,
            Open: 5,
            PageDown: 6,
            PageUp: 7,
            Previous: 8,
            Select: 9,
            Type: 10,
        };

        /*
        * Helper functions
        */

        // filter an array of options against an input string
        // returns an array of options that begin with the filter string, case-independent
        this.filterOptions = (options = [], filter, exclude = []) => {
            return options.filter((option) => {
                const matches = option.toLowerCase().indexOf(filter.toLowerCase()) === 0;
                return matches && exclude.indexOf(option) < 0;
            });
        }

        // map a key press to an action
        this.getActionFromKey = (event, menuOpen) => {
            const { key, altKey, ctrlKey, metaKey } = event;
            const openKeys = ['ArrowDown', 'ArrowUp', 'Enter', ' ']; // all keys that will do the default open action
            // handle opening when closed
            if (!menuOpen && openKeys.includes(key)) {
                return this.SelectActions.Open;
            }

            // home and end move the selected option when open or closed
            if (key === 'Home') {
                return this.SelectActions.First;
            }
            if (key === 'End') {
                return this.SelectActions.Last;
            }

            // handle typing characters when open or closed
            if (
                key === 'Backspace' ||
                key === 'Clear' ||
                (key.length === 1 && key !== ' ' && !altKey && !ctrlKey && !metaKey)
            ) {
                return this.SelectActions.Type;
            }

            // handle keys when open
            if (menuOpen) {
                if (key === 'ArrowUp' && altKey) {
                return this.SelectActions.CloseSelect;
                } else if (key === 'ArrowDown' && !altKey) {
                return this.SelectActions.Next;
                } else if (key === 'ArrowUp') {
                return this.SelectActions.Previous;
                } else if (key === 'PageUp') {
                return this.SelectActions.PageUp;
                } else if (key === 'PageDown') {
                return this.SelectActions.PageDown;
                } else if (key === 'Escape') {
                return this.SelectActions.Close;
                } else if (key === 'Enter' || key === ' ') {
                return this.SelectActions.CloseSelect;
                }
            }
        }

        // return the index of an option from an array of options, based on a search string
        // if the filter is multiple iterations of the same letter (e.g "aaa"), then cycle through first-letter matches
        this.getIndexByLetter = (options, filter, startIndex = 0) => {
            const orderedOptions = [
                ...options.slice(startIndex),
                ...options.slice(0, startIndex),
            ];
            const firstMatch = this.filterOptions(orderedOptions, filter)[0];
            const allSameLetter = (array) => array.every((letter) => letter === array[0]);

            // first check if there is an exact match for the typed string
            if (firstMatch) {
                return options.indexOf(firstMatch);
            }

            // if the same letter is being repeated, cycle through first-letter matches
            else if (allSameLetter(filter.split(''))) {
                const matches = this.filterOptions(orderedOptions, filter[0]);
                return options.indexOf(matches[0]);
            }

            // if no matches, return -1
            else {
                return -1;
            }
        }

        // get an updated option index after performing an action
        this.getUpdatedIndex = (currentIndex, maxIndex, action) => {
            const pageSize = 10; // used for pageup/pagedown

            switch (action) {
                case this.SelectActions.First:
                return 0;
                case this.SelectActions.Last:
                return maxIndex;
                case this.SelectActions.Previous:
                return Math.max(0, currentIndex - 1);
                case this.SelectActions.Next:
                return Math.min(maxIndex, currentIndex + 1);
                case this.SelectActions.PageUp:
                return Math.max(0, currentIndex - pageSize);
                case this.SelectActions.PageDown:
                return Math.min(maxIndex, currentIndex + pageSize);
                default:
                return currentIndex;
            }
        }

        // check if element is visible in browser view port
        this.isElementInView = (element) => {
            var bounding = element.getBoundingClientRect();
            return (
                bounding.top >= 0 &&
                bounding.left >= 0 &&
                bounding.bottom <=
                (window.innerHeight || document.documentElement.clientHeight) &&
                bounding.right <=
                (window.innerWidth || document.documentElement.clientWidth)
            );
        }

        // check if an element is currently scrollable
        this.isScrollable = (element) => {
            return element && element.clientHeight < element.scrollHeight;
        }

        // ensure a given child element is within the parent's visible scroll area
        // if the child is not visible, scroll the parent
        this.maintainScrollVisibility = (activeElement, scrollParent) => {
            const { offsetHeight, offsetTop } = activeElement;
            const { offsetHeight: parentOffsetHeight, scrollTop } = scrollParent;

            const isAbove = offsetTop < scrollTop;
            const isBelow = offsetTop + offsetHeight > scrollTop + parentOffsetHeight;

            if (isAbove) {
                scrollParent.scrollTo(0, offsetTop);
            } else if (isBelow) {
                scrollParent.scrollTo(0, offsetTop - parentOffsetHeight + offsetHeight);
            }
        }

        // init
        if (this.el && this.comboEl && this.listboxEl) {
            this.init();
        }
    }
    init() {
        // select first option by default
        this.comboEl.innerHTML = this.settings.options[0];

        // add event listeners
        this.labelEl.addEventListener('click', this.onLabelClick.bind(this));
        this.comboEl.addEventListener('blur', this.onComboBlur.bind(this));
        this.listboxEl.addEventListener('focusout', this.onComboBlur.bind(this));
        this.comboEl.addEventListener('click', this.onComboClick.bind(this));
        this.comboEl.addEventListener('keydown', this.onComboKeyDown.bind(this));

        // create options
        this.settings.options.map((option, index) => {
            const optionEl = this.createOption(option, index);
            this.listboxEl.appendChild(optionEl);
        });
    }
    createOption(optionText, index) {
        const optionEl = document.createElement('div');
        optionEl.setAttribute('role', 'option');
        optionEl.id = `${this.idBase}-${index}`;
        optionEl.className =
            index === 0 ? 'ev-custom-select-option option-current' : 'ev-custom-select-option';
        optionEl.setAttribute('aria-selected', `${index === 0}`);
        optionEl.innerText = optionText;

        optionEl.addEventListener('click', (event) => {
            event.stopPropagation();
            this.onOptionClick(index);
        });
        optionEl.addEventListener('mousedown', this.onOptionMouseDown.bind(this));

        return optionEl;
    }
    getSearchString(char) {
        // reset typing timeout and start new timeout
        // this allows us to make multiple-letter matches, like a native select
        if (typeof this.searchTimeout === 'number') {
            window.clearTimeout(this.searchTimeout);
        }

        this.searchTimeout = window.setTimeout(() => {
            this.searchString = '';
        }, 500);

        // add most recent letter to saved search string
        this.searchString += char;
        return this.searchString;
    }
    onLabelClick() {
        this.comboEl.focus();
    }
    onComboBlur(event) {
        // do nothing if relatedTarget is contained within listboxEl
        if (this.listboxEl.contains(event.relatedTarget)) {
            return;
        }

        // select current option and close
        if (this.open) {
            this.selectOption(this.activeIndex);
            this.updateMenuState(false, false);
        }
    }
    onComboClick() {
        this.updateMenuState(!this.open, false);
    }
    onComboKeyDown(event) {
        const { key } = event;
        const max = this.settings.options.length - 1;

        const action = this.getActionFromKey(event, this.open);

        switch (action) {
            case this.SelectActions.Last:
            case this.SelectActions.First:
                this.updateMenuState(true);
            // intentional fallthrough
            case this.SelectActions.Next:
            case this.SelectActions.Previous:
            case this.SelectActions.PageUp:
            case this.SelectActions.PageDown:
                event.preventDefault();
                return this.onOptionChange(
                    this.getUpdatedIndex(this.activeIndex, max, action)
                );
            case this.SelectActions.CloseSelect:
                event.preventDefault();
                this.selectOption(this.activeIndex);
            // intentional fallthrough
            case this.SelectActions.Close:
                event.preventDefault();
                return this.updateMenuState(false);
            case this.SelectActions.Type:
                return this.onComboType(key);
            case this.SelectActions.Open:
                event.preventDefault();
                return this.updateMenuState(true);
        }
    }
    onComboType(letter) {
        // open the listbox if it is closed
        this.updateMenuState(true);

        // find the index of the first matching option
        const searchString = this.getSearchString(letter);
        const searchIndex = this.getIndexByLetter(
            this.settings.options,
            searchString,
            this.activeIndex + 1
        );

        // if a match was found, go to it
        if (searchIndex >= 0) {
            this.onOptionChange(searchIndex);
        }

        // if no matches, clear the timeout and search string
        else {
            window.clearTimeout(this.searchTimeout);
            this.searchString = '';
        }
    }
    onOptionChange(index) {
        // update state
        this.activeIndex = index;

        // update aria-activedescendant
        this.comboEl.setAttribute('aria-activedescendant', `${this.idBase}-${index}`);

        // update active option styles
        const options = this.el.querySelectorAll('[role=option]');
        [...options].forEach((optionEl) => {
            optionEl.classList.remove('option-current');
        });
        options[index].classList.add('option-current');

        // ensure the new option is in view
        if (this.isScrollable(this.listboxEl)) {
            this.maintainScrollVisibility(options[index], this.listboxEl);
        }

        // ensure the new option is visible on screen
        // ensure the new option is in view
        if (!this.isElementInView(options[index])) {
            options[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // callback
        if (typeof this.settings.onOptionChange === "function") {
            this.settings.onOptionChange(this.settings.options[this.activeIndex]);
        }
    }
    onOptionClick(index) {
        this.onOptionChange(index);
        this.selectOption(index);
        this.updateMenuState(false);
    }
    onOptionMouseDown() {
        // Clicking an option will cause a blur event,
        // but we don't want to perform the default keyboard blur action
        this.ignoreBlur = true;
    }
    selectOption(index) {
        // update state
        this.activeIndex = index;

        // update displayed value
        const selected = this.settings.options[index];
        this.comboEl.innerHTML = selected;

        // update aria-selected
        const options = this.el.querySelectorAll('[role=option]');
        [...options].forEach((optionEl) => {
            optionEl.setAttribute('aria-selected', 'false');
        });
        options[index].setAttribute('aria-selected', 'true');
    }
    updateMenuState(open, callFocus = true) {
        if (this.open === open) {
            return;
        }

        // update state
        this.open = open;

        // update aria-expanded and styles
        this.comboEl.setAttribute('aria-expanded', `${open}`);
        open ? this.el.classList.add('ev-custom-select-open') : this.el.classList.remove('ev-custom-select-open');

        // update activedescendant
        const activeID = open ? `${this.idBase}-${this.activeIndex}` : '';
        this.comboEl.setAttribute('aria-activedescendant', activeID);

        if (activeID === '' && !this.isElementInView(this.comboEl)) {
            this.comboEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // move focus back to the combobox, if needed
        callFocus && this.comboEl.focus();
    }
}



/*
    Dialog
*/

function GetEVSwalOptions() {
    return {
        allowOutsideClick: false,
        allowEscapeKey: true,
        returnFocus: false,
        showCloseButton: true,
        closeButtonAriaLabel: "Fechar",
        showConfirmButton: false,
        color: "#000000",
        customClass: {
            popup: 'ev-store-swal-popUp',
            title: 'ev-store-swal-title',
            htmlContainer: 'ev-store-swal-html',
            closeButton: 'ev-store-swal-closeButton',
        },
    };
}

class Dialog {
    constructor(selector, userOptions) {
        const defaultOptions = {

            /////////////////////////////////////////////////////
            // ObrigatÃ³rio o desenvolvedor preencher estas opÃ§Ãµes
            /////////////////////////////////////////////////////

            mode: null, // "modal" / "nonmodal"

            /////////////////////////////////////////////////////
            // Opcional
            /////////////////////////////////////////////////////

            /*
                Se o diÃ¡logo for acionado por um botÃ£o na pÃ¡gina
                (ex: sub-menu do header), definir um seletor atravÃ©s
                deste parÃ¢metro adicionarÃ¡ um "aria-controls" no
                botÃ£o com o valor do ID deste diÃ¡logo
            */
            toggleBtn: null,

            modeSettings: {
                /*
                    Modo "nonmodal":

                    OPCIONAL:

                    - nudge: (string)
                    Adiciona um texto com "aria-live", para alertar
                    o utilizador para a existÃªncia do dialog mas
                    deixando ao seu critÃ©rio a sua leitura.

                    - delay: (number)
                */
            },

        };
        let options = {...defaultOptions, ...userOptions};
        this.options = () => options; // Getter

        let closeBtn = null;

        // "selector" pode ser:
        // - string
        // - elemento HTML com classe ".ev-dialog"
        const element = selector instanceof HTMLElement ? selector : document.querySelector(selector);

        // VerificaÃ§Ã£o de erros:
        if (element instanceof HTMLElement && element.classList.contains("ev-dialog")) {
            // Erros de opÃ§Ãµes obrigatÃ³rias:
            if (options.modal === null) { throw new Error(`[Dialog] OpÃ§Ã£o "modal" nÃ£o definida`)};

            //
            closeBtn = element.querySelector(".ev-dialog-closebtn");

            if (!closeBtn) throw new Error(`[Dialog] Nenhum botÃ£o de fechar encontrado`);
            else {
                // InicializaÃ§Ã£o
                let modeState = {};
                switch (options.mode) {
                    case "modal":
                        element.setAttribute("role", "dialog");
                        element.setAttribute("aria-modal", "true");
                        break;
                    case "nonmodal":
                        // Role de "region", para criar um "landmark"
                        // diretamente navegÃ¡vel
                        element.setAttribute("role", "region");

                        if (!options.modeSettings.label && !options.modeSettings.labelledby) {
                            // Verificar se markup HTML jÃ¡ tem label definida.
                            const elementLabel = element.getAttribute("aria-label");
                            const elementLabelledBy = element.getAttribute("aria-labelledby");
                            if (elementLabel && elementLabelledBy) throw new Error(`[Dialog] aria-label e aria-labelledby definidos ao mesmo tempo no cÃ³digo HTML. SÃ³ um destes atributos pode ser definido ao mesmo tempo.`);
                            else if (!elementLabel && !elementLabelledBy) throw new Error(`[Dialog] Falta uma etiqueta acessÃ­vel para este diÃ¡logo nÃ£o-modal, tanto nas opÃ§Ãµes desta instÃ¢ncia como no cÃ³digo HTML`);
                        } else if (options.modeSettings.label && options.modeSettings.labelledby) {
                            throw new Error(`[Dialog] OpÃ§Ãµes "label" e "labelledby" definidas ao mesmo tempo. SÃ³ uma pode ser definida ao mesmo tempo. `);
                        } else {
                            if (options.modeSettings.label) {
                                if (typeof options.modeSettings.label !== "string") {
                                    throw new Error("[Dialog] Valor de opÃ§Ã£o 'label' invÃ¡lido");
                                } else element.setAttribute("aria-label", options.modeSettings.label);
                            }
                            if (options.modeSettings.labelledby) {
                                if (typeof options.modeSettings.labelledby !== "string") {
                                    throw new Error("[Dialog] Valor de opÃ§Ã£o 'labelledby' invÃ¡lido");
                                } else element.setAttribute("aria-labelledby", options.modeSettings.label);
                            }
                        }

                        // Configurar nudge, se declarado.
                        if (typeof options.modeSettings.nudge === "string") {
                            let newNudge = element.querySelector(".ev-dialog-nonmodal-nudge");
                            if (newNudge) throw new Error("[Dialog] OpÃ§Ã£o 'nudge' estÃ¡ true mas nenhum elemento foi encontrado dentro do diÃ¡logo");
                            else {
                                newNudge = document.createElement("div");
                                newNudge.className = "ev-dialog-nonmodal-nudge ev-sr-only";
                                newNudge.setAttribute("aria-live", "polite");
                                element.prepend(newNudge); // Colocar como primeiro "filho" do elemento

                                // Remover elemento de "nudge" quando/se o utilizador navegar
                                // para dentro deste diÃ¡logo.
                                const removeNudge = () => {
                                    newNudge.remove();
                                    element.removeEventListener("focusin", removeNudge);
                                };
                                element.addEventListener("focusin", removeNudge);

                                // Adiciona o conteÃºdo desejado ao elemento "nudge",
                                // o que, via "aria-live", criarÃ¡ o anÃºncio no screen
                                // reader
                                modeState.addNudge = () => {
                                    newNudge.textContent = options.modeSettings.nudge;
                                };
                            }
                        } else if (options.modeSettings.nudge) {
                            throw new Error("[Dialog] Valor de opÃ§Ã£o 'nudge' invÃ¡lido");
                        }

                        //
                        this.show = () => {
                            element.classList.add("ev-dialog-visible");
                            if (EscolaVirtual.pagina !== null && EscolaVirtual.pagina instanceof Pagina) {
                                EscolaVirtual.pagina.adicionarDialogo(this);
                            }
                            if (modeState.addNudge) modeState.addNudge();
                        }

                        this.close = () => {
                            element.remove();
                        };

                        // Adicionar delay, se declarado
                        if (options.modeSettings.delay) {
                            if (typeof options.modeSettings.delay !== "number") {    
                                throw new Error("[Dialog] Valor de opÃ§Ã£o 'delay' invÃ¡lido");
                            } else {
                                setTimeout(() => this.show(), options.modeSettings.delay);
                            }
                        }

                        break;
                    default:
                        throw new Error(`[Dialog] OpÃ§Ã£o "mode" nÃ£o definida`);
                }
            }
        }
    }
}

class Modal {
    opcoesDefault =  {
        /*
            Se ID indicado jÃ¡ existir dentro da modal-caixa, serÃ¡ utilizado.
            SenÃ£o, novo elemento modal serÃ¡ criado.
        */
        id: "",

        /*
            Nome acessÃ­vel da modal.

            Tipos de valores permitidos:

            - string
            SerÃ¡ inserido como "aria-label". NÃ£o pode ser um string vazio.

            - {by: string}
            Valor de string deve ser o ID vÃ¡lido de um elemento que nÃ£o pode
            estar vazio de conteÃºdo. ID serÃ¡ inserido como "aria-labelledby"
        */

        label: "",

        modal: true,

        /*
            Como deverÃ¡ ser disparada a modal?
        */
        trigger: {
            /*
                Abrir logo apÃ³s o carregamento da pÃ¡gina.

                Esta propriedade deve ser uma string e sÃ£o
                aceitos trÃªs valores:
                - "false": NÃ£o abrir automaticamente
                - "ifExists": Se conteÃºdo for encontrado, abrir automaticamente.
                SenÃ£o, nÃ£o fazer nada nem atirar erro (Ãºtil para agendamentos,
                quando a data de abertura da pÃ¡gina for antes do mesmo).
                - "true"
            */
            auto: "false",

            /*
                Query selector para um ou mais botÃµes que devem ativar
                a modal, quando pressionados.
            */
           buttons: ""
        },

        /*
            Existem duas formas de definir o conteÃºdo:
            - AtravÃ©s desta opÃ§Ã£o
            - AtravÃ©s do atributo "data-ev-dialognovo-content" em qualquer
            trigger que acione a instÃ¢ncia da modal.

            Esta opÃ§Ã£o Ã© OPCIONAL APENAS:
            - Se todos os triggers associados Ã  instÃ¢ncia da modal definirem
            o atributo referido acima.

            Por outro lado, Ã© NECESSÃRIA caso o atributo
            trigger.auto esteja ativo. Mas a omissÃ£o nÃ£o causarÃ¡ erro, a modal
            simplesmente nÃ£o abrirÃ¡ (Ãºtil para agendamentos).

            Esta opÃ§Ã£o Ã© OBRIGATÃ“RIA em todas as restantes situaÃ§Ãµes, nomeadamente:
            - Um ou mais triggers desta modal NÃƒO definem o atributo
            "data-ev-dialognovo-content"


        */
        content: "",

        /*
            Para proporcionar o aspeto desejado.
        */

        estilo: {
            /*
            O valor da propriedade "classe", se nÃ£o for um string vazio, serÃ¡ aplicado como
            classe do elemento correspondente Ã  modal em si.

            Para alÃ©m desta classe, adicionamos automaticamente a classe de base
            "--modo-default", para a montagem bÃ¡sica de modais com conteÃºdo HTML, 
            ou "--modo-iframe" quando o conteÃºdo da modal Ã© um link URL.

            As regras da classe que aqui inserir devem partir daquelas definidas
            pela base em questÃ£o.
            */
            classe: "",

            /*
            O valor da propriedade "container", se nÃ£o for um string vazio, serÃ¡
            aplicado como classe da caixa com a modal ativa, gerido pela DialogManager.

            Pode utilizar para criar regras que manipulem o backdrop e opacidade (incl.
            animaÃ§Ãµes CSS), entre outros.

            As regras prÃ©-definidas tÃªm como base as classes que indicam uma modal ativa ou nÃ£o
            na caixa modal ativa: "--estado-on" ou "--estado-off".
            */

            container: "",
        }
    };

    constructor(options = this.opcoesDefault) {
        this.opcoesDefinidas = {
            ...this.opcoesDefault,
            ...options
        };
        this.opcoesDefinidas.trigger = {
            ...this.opcoesDefault.trigger,
            ...options.trigger
        }

        /*
            ValidaÃ§Ã£o de opÃ§Ãµes
        */
        if (this.opcoesDefinidas.id === "") {
            throw new Error("[Dialog] Ã‰ obrigatÃ³rio definir um ID para esta instÃ¢ncia");
        }

        /*
            "Constantes"
        */

        this.classes = {
            btnFechar: "ev-dialognovo-btn-fechar",
            modal: "--modal",
            naoModal: "--nao-modal",
            modos: {
                default: "--modo-default",
                iframe: "--modo-iframe",
            },
            estados: {
                on: "--estado-on",
                off: "--estado-off"
            }
        }
        this.estado = {
            autoAberto: false,

            /*
            */
            ativo: false,
            modo: "",
            oldModo: "",
            estilo: ""
        }

        /*
            Montar elementos
        */
        this.elemento = document.querySelector(`#${this.opcoesDefinidas.id}.ev-dialognovo`);
        if (!this.elemento) {
            this.elemento = document.createElement("div");
            this.elemento.id = this.opcoesDefinidas.id;
            this.elemento.className = "ev-dialognovo";
        }
        this.elemento.role = "dialog";
        if (typeof this.opcoesDefinidas.label === "string") {
            if (this.opcoesDefinidas.label === "") {
                throw new Error(`[Modal "${this.opcoesDefinidas.id}"] OpÃ§Ã£o "label" nÃ£o contÃ©m texto.`);
            }
            this.elemento.ariaLabel = this.opcoesDefinidas.label === "" ? null : this.opcoesDefinidas.label;
            this.elemento.ariaLabelledByElements = null;
        } else if (this.opcoesDefinidas.label.by) {
            const byEl = document.querySelector(this.opcoesDefinidas.label.by);
            if (!byEl) {
                throw new Error(`[Modal "${this.opcoesDefinidas.id}"] NÃ£o foi encontrado nenhum elemento com o valor atual de label.by.`);
            } else if (byEl && byEl.textContent === "" || byEl && byEl.textContent === null) {
                throw new Error(`[Modal "${this.opcoesDefinidas.id}"] Elemento selecionado atravÃ©s da opÃ§Ã£o "label.by" nÃ£o contÃ©m texto.`);
            }

            this.elemento.ariaLabelledByElements = [this.opcoesDefinidas.label.by];
            this.elemento.ariaLabel = null;
        }

        if (this.opcoesDefinidas.modal) {
            this.elemento.setAttribute("aria-modal", "true");
        }

        this.btnFechar = this.elemento.querySelector(".ev-dialognovo-btn-fechar");
        if (!this.btnFechar) {
            this.btnFechar = document.createElement("button");
            this.btnFechar.className = "ev-dialognovo-btn-fechar";
        }
        this.btnFechar.ariaLabel = "Fechar modal";
        this.elemento.append(this.btnFechar);

        this.btnFechar.addEventListener("click", (e) => {
            this.fechar();
        });

        this.conteudo = null;

        /*
            Inicializar dialog manager para a pÃ¡gina, se nenhum
            estiver definido entretanto.
        */

        if (EscolaVirtual.dialogManager === null) {
            EscolaVirtual.dialogManager = new DialogManager();
        }

        if (EscolaVirtual.dialogManager) {
            EscolaVirtual.dialogManager.instanciados.append(this.elemento);
        }

        /*
            ConfiguraÃ§Ã£o inicial
        */

        /*
            Agir conforme opÃ§Ãµes definidas
        */

        if (this.opcoesDefinidas.trigger.buttons !== "") {
            this.botoesTrigger = [...document.querySelectorAll(this.opcoesDefinidas.trigger.buttons)];
            this.botoesTrigger.forEach((btn) => {
                btn.addEventListener("click", () => {
                    let btnTargetContent = btn.getAttribute("data-ev-dialognovo-content");
                    if (btnTargetContent === null) btnTargetContent = "";

                    this.abrir(btnTargetContent);
                })
            })
        }

        if (this.opcoesDefinidas.trigger.auto !== "false") {
            console.log(`[Modal ${this.opcoesDefinidas.id}] Trigger is ${this.opcoesDefinidas.trigger.auto}`);

            window.addEventListener("load", () => {
                this.estado.autoAberto = true;

                try {
                    this.abrir();
                }
                catch (err) {
                    /*
                        Apenas atirar erro se 
                    */
                    if (err.cause === "idnotfound" && this.opcoesDefinidas.trigger.auto !== "ifExists") {
                        throw err;
                    }
                }
            });
        } else {
            this.configurar();
        }
    }

    /*
        MÃ©todos internos
    */

    configurar(manualmente = "") { 
        let insertedOption = "";
        if (typeof manualmente === "string" && manualmente !== "") {
            insertedOption = manualmente.trim();
        } else {
            insertedOption = this.opcoesDefinidas.content.trim();
        }

        /*
        Apenas agir se, de facto, conteÃºdo foi definido
        */

        if (insertedOption) {
            console.log(`[Dialog ${this.opcoesDefinidas.id}] Inserted option = ${insertedOption}`);

            /*
                Gerir conteÃºdo antigo

                Se conteÃºdo foi link, pode ser removido.
                SenÃ£o, guardar no elemento de arquivo de conteÃºdos.
            */

            if (this.conteudo) {
                if (this.conteudo.tagName === "IFRAME") {
                    this.conteudo.remove();
                } else {
                    this.sinalizarManager("arquivar-conteudo");
                    //this.sinalizarManager("arquivar-conteudo");
                }
            }

            /*
                Aplicar novo
            */

            let novoModo = "";

            if (insertedOption.includes("http", 0) || insertedOption.includes("/", 0)) {
                if (!this.opcoesDefinidas.modal) {
                    throw new Error(`[Dialog ${this.opcoesDefinidas.id}] NÃ£o Ã© possÃ­vel neste momento usar conteÃºdo URL em nÃ£o-modais.`);
                }

                /*
                    O conteÃºdo serÃ¡ um URL (iframe).

                    Se for um vÃ­deo de YouTube, convertemos o link para embed primeiro, caso seja
                    necessÃ¡rio.
                */

                const ytLinkRegex = /(?:https?:\/\/)?(?:.*\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/;
                if (ytLinkRegex.test(insertedOption)) {
                    insertedOption = insertedOption.replace(ytLinkRegex, "https://www.youtube.com/embed/$1")
                }

                /*
                    Ã€ partida funcionarÃ¡ tanto com URLs completos (https://etcetc.pt) como
                    relativos (a comeÃ§ar por /) mas, quando quiseres embeber pÃ¡ginas
                    da Escola Virtual (p.ex. FAQs), recomenda-se a segunda de forma a
                    que o iframe funcione em QLD.
                */
                
                this.conteudo = document.createElement("iframe");
                this.conteudo.src = insertedOption;
                this.conteudo.className = "ev-dialognovo-conteudo";

                novoModo = "iframe";
            } else if (insertedOption.includes("#", 0)) {
                /*
                    O conteÃºdo serÃ¡ um ID existente na pÃ¡gina
                */
                const conteudoAInserir = document.querySelector(insertedOption);

                if (!conteudoAInserir) {
                    throw new Error(`[Dialog #${this.opcoesDefinidas.id}] ID de conteÃºdo indicado nÃ£o existe na pÃ¡gina`, { cause: "idnotfound" });
                }
                else {
                    this.conteudo = conteudoAInserir;
                    this.conteudo.role = "presentation";
                    this.conteudo.className = "ev-dialognovo-conteudo";
                }

                novoModo = "default";
            }


            this.estado.modo = novoModo;
            this.elemento.append(this.conteudo);
        }

        /****************************
        Adicionar/alterar classes CSS
        ****************************/

        /* Modal ou nÃ£o-modal */
        if (
            this.elemento.classList.contains(
                this.opcoesDefinidas.modal ? this.classes.naoModal : this.classes.modal
            )
        ) {
            this.elemento.classList.replace(
                this.opcoesDefinidas.modal ? this.classes.naoModal : this.classes.modal,
                this.opcoesDefinidas.modal ? this.classes.modal : this.classes.naoModal
            );
        }
        if (!this.elemento.classList.contains(
                this.opcoesDefinidas.modal ? this.classes.modal : this.classes.naoModal
            )
        ) {
            this.elemento.classList.add(this.opcoesDefinidas.modal ? this.classes.modal : this.classes.naoModal);
        }

        /* Tipo de conteÃºdo */
        if (this.estado.oldModo !== "") {
            this.elemento.classList.remove(this.classes.modos[this.estado.oldModo]);
        }
        if (this.estado.modo !== "") {
            this.elemento.classList.add(this.classes.modos[this.estado.modo]);
        }

        /* Estilo */
        if (this.elemento.classList.contains(this.estado.estilo)) {
            this.elemento.classList.remove(this.estado.estilo)
        }
        if (this.opcoesDefinidas.estilo.classe && this.opcoesDefinidas.estilo.classe !== "") {
            this.estado.estilo = this.opcoesDefinidas.estilo.classe;
            this.elemento.classList.add(this.estado.estilo);
        }

        /****************************
        Adicionar conteÃºdo ao elemento da modal
        ****************************/


    }

   alterarEstado(novoEstado) {
        if (typeof novoEstado !== "boolean") {
            throw new Error(`[Dialog ${this.opcoesDefinidas.id}] Novo estado nÃ£o Ã© bool`);
        }

        this.estado.ativo = novoEstado;

        if (
            this.elemento.classList.contains(
                novoEstado ? this.classes.estados.off : this.classes.estados.on
            )
        ) {
            this.elemento.classList.replace(
                novoEstado ? this.classes.estados.off : this.classes.estados.on,
                novoEstado ? this.classes.estados.on : this.classes.estados.off
            )
        } else if (
            !this.elemento.classList.contains(
                novoEstado ? this.classes.estados.on : this.classes.estados.off
            )
        ) {
            this.elemento.classList.add(
                novoEstado ? this.classes.estados.on : this.classes.estados.off
            )
        }

        /*
            Toggle interatividade do diÃ¡logo
        */
        SetInert(
            [this.elemento],
            !novoEstado
        );
    }

    sinalizarManager(dados) {
        EscolaVirtual.dialogManager.receber(this, dados);
    }

    receberDoManager(dados) {
        switch (dados) {
            case "estado-true":
                this.alterarEstado(true);
                break;
            case "estado-false":
                this.alterarEstado(false);
                break;
            case "pedido-fecho":
                /*
                Embora fosse possÃ­vel fechar diretamente a partir da instÃ¢ncia
                DialogManager, em vez de fazer este loop de pedir ao diÃ¡logo
                e ele sinalizar ao manager de novo, ao fazermos assim temos a
                oportunidade (se no futuro quisermos) de realizarmos accÃ§Ãµes
                antes de dizermos ao manager para fechar.
                */
                this.sinalizarManager("fechar");
                break;
            default:
                throw new Error(`[DialogManager] Dados enviados por diÃ¡logo com ID "${dialogo.opcoesDefinidas.id}" nÃ£o sÃ£o vÃ¡lidos`);
        }
    }

    /*
        MÃ©todos externos
    */

    abrir(conteudo = "") {
        if (!this.estado.ativo) {
            this.configurar(conteudo);
        }

        this.sinalizarManager("abrir");
    }

    fechar() {
        if (this.estado.ativo) {
            this.sinalizarManager("fechar");
        }
    }
}

class DialogManager {
    outrosElementos = [...document.querySelectorAll(EscolaVirtual.outsideInertSelector)];
    classes = {
        modalwindow: {
            modos: {
                default: "--modalmodo-default",
                iframe: "--modalmodo-iframe",
            },
            estados: {
                on: "--estado-on",
                off: "--estado-off"
            }
        },
    }
    estado = {
        naoModais: [],
        modalwindow: {
            ativo: false,
            inserida: null, /* InstÃ¢ncia da classe "Modal" que estÃ¡ ativa neste momento */
            modo: "",
            oldModo: "",
            classeCustom: "",
        },
        prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
    
    constructor() {
        /*
            Montar elementos
        */
        this.conteudos = document.querySelector(".ev-dialognovo-conteudos");
        if (!this.conteudos) {
            this.conteudos = document.createElement("div");
            this.conteudos.className = "ev-dialognovo-conteudos";
        }
        this.conteudos.ariaHidden = "true";

        this.instanciados = document.querySelector(".ev-dialognovo-instanciados");
        if (!this.instanciados) {
            this.instanciados = document.createElement("div");
            this.instanciados.className = "ev-dialognovo-instanciados";
        }
        this.instanciados.ariaHidden = "true";

        this.visiveis = document.querySelector(".ev-dialognovo-visiveis");
        if (!this.visiveis) {
            this.visiveis = document.createElement("div");
            this.visiveis.className = "ev-dialognovo-visiveis";
        }
        this.visiveis.role = "presentation";

        /***/

        this.visiveisModal = document.querySelector(".ev-dialognovo-modalwindow");
        if (!this.visiveisModal) {
            this.visiveisModal = document.createElement("div");
            this.visiveisModal.className = "ev-dialognovo-modalwindow";
        }
        this.visiveisModal.role = "presentation";

        this.visiveisModalBackdrop = document.querySelector(".ev-dialognovo-modalwindow-backdrop");
        if (!this.visiveisModalBackdrop) {
            this.visiveisModalBackdrop = document.createElement("div");
            this.visiveisModalBackdrop.className = "ev-dialognovo-modalwindow-backdrop";
        }
        this.visiveisModalBackdrop.role = "presentation";

        /***/

        this.visiveisModal.append(this.visiveisModalBackdrop);
        this.visiveis.append(this.visiveisModal);

        this.visiveisModalBackdrop.addEventListener("click", (e) => {
            if (this.estado.modalwindow.inserida instanceof Modal) {
                this.estado.modalwindow.inserida.receberDoManager("pedido-fecho");
            }
        });
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !EscolaVirtual.subMenuAberto) {
                if (this.estado.modalwindow.inserida) {
                    /* Modal sempre fechada primeiro */
                    this.estado.modalwindow.inserida.receberDoManager("pedido-fecho");
                } else if (
                    !this.estado.modalwindow.inserida
                    || this.estado.modalwindow.inserida && !this.estado.modalwindow.ativo
                ) {
                    /* Se existirem nÃ£o-modais, fechamos essas */
                    if (this.estado.naoModais[0]) {
                        this.estado.naoModais[0].receberDoManager("pedido-fecho");
                    }
                }
            }
        });
        /*
            Inserir na DOM
        */

        const elementoBefore = document.querySelector("#ConteudoPrincipal");
        if (!elementoBefore) {
            throw new Error("[DialogManager] NÃ£o foi encontrado nenhum elemento, apÃ³s o qual a caixa com a modal ativa deve ser adicionada");
        } else {
            document.body.insertBefore(this.visiveis, elementoBefore);
        }
        this.visiveis.after(this.conteudos);
        this.conteudos.after(this.instanciados);
    }

    receber(dialogo, dados) {
        switch (dados) {
            case "abrir":
                /*
                    Apenas inserir se nÃ£o for modal ou, caso seja, se a anterior jÃ¡ tiver sido removida
                */
                if (!dialogo.opcoesDefinidas.modal 
                    || dialogo.opcoesDefinidas.modal && !this.estado.modalwindow.ativo && !this.estado.modalwindow.inserida) {
                    this.inserir(dialogo);
                }
                break;
            case "fechar":
                this.remover(dialogo);
                break;
            case "arquivar-conteudo":
                if (dialogo instanceof Modal) {
                    this.arquivarConteudo(dialogo.conteudo);
                }
                break;
            default:
                throw new Error(`[DialogManager] Dados enviados por diÃ¡logo com ID "${dialogo.opcoesDefinidas.id}" nÃ£o sÃ£o vÃ¡lidos`);
        }
    }

    inserir(dialogo) {
        if (dialogo instanceof Modal) {
            if (dialogo.opcoesDefinidas.modal) {
                this.estado.modalwindow.inserida = dialogo;
                this.visiveisModal.append(dialogo.elemento);
                this.alterarEstadoModalWindow(true);
            } else {
                this.estado.naoModais.push(dialogo);
                this.visiveis.append(dialogo.elemento);
            }

            dialogo.receberDoManager("estado-true");
        }
    }

    arquivar(dialogo) {
        if (dialogo.opcoesDefinidas.modal) {
            this.instanciados.append(dialogo.elemento);
            this.estado.modalwindow.inserida = null;
        } else {
            this.instanciados.append(dialogo.elemento);
            const naoModalIndex = this.estado.naoModais.findIndex((value) => value === dialogo);
            this.estado.naoModais.splice(
                naoModalIndex, 1
            );
        }
    }

    arquivarConteudo(conteudoEmQuestao) {
        if (conteudoEmQuestao instanceof HTMLElement) {
            this.conteudos.append(conteudoEmQuestao);
        }
    }

    remover(dialogo) {
        if (dialogo instanceof Modal) {
            dialogo.receberDoManager("estado-false");

            if (dialogo.opcoesDefinidas.modal) {
                this.alterarEstadoModalWindow(false);
            }

            if (this.estado.prefersReducedMotion) {
                /*
                    Executar imediatamente
                */
                this.arquivar(dialogo);
            } else {
                function waitForAnimation(el) {
                    /*
                        Esperar por animaÃ§Ã£o do "estado off", se existir.
                        SenÃ£o, executar imediatamente.
                    */

                    return new Promise((resolve) => {
                        const styles = getComputedStyle(el);
                        const duration = parseFloat(styles.animationDuration);

                        if (!duration) return resolve();

                        el.addEventListener('animationend', resolve, { once: true });
                    });
                }

                waitForAnimation(dialogo.elemento).then(() => this.arquivar(dialogo));
            }
        }
    }

   alterarEstadoModalWindow(novoEstado) {
        if (typeof novoEstado !== "boolean") {
            throw new Error(`[Dialog ${this.opcoesDefinidas.id}] Novo estado nÃ£o Ã© bool`);
        }

        this.estado.modalwindow.ativo = novoEstado;

        /****************************
        Adicionar/alterar classes CSS
        ****************************/

        /* Tipo de conteÃºdo da modal */

        this.estado.modalwindow.modo = this.estado.modalwindow.inserida.estado.modo;

        if (this.estado.modalwindow.oldModo !== "") {
            this.visiveisModal.classList.remove(this.classes.modalwindow.modos[this.estado.modalwindow.oldModo]);
            this.estado.modalwindow.oldModo = this.estado.modalwindow.inserida.estado.modo;
        } else {
            /*
                Preparar para o prÃ³ximo ciclo
            */
           this.estado.modalwindow.oldModo = this.estado.modalwindow.inserida.estado.modo;
        }
        
        if (this.estado.modalwindow.modo !== "") {
            this.visiveisModal.classList.add(this.classes.modalwindow.modos[this.estado.modalwindow.modo]);
        }

        /* Classe customizada */

        if (this.estado.modalwindow.classeCustom !== "") {
            this.visiveisModal.classList.replace(
                this.classes.modos[this.estado.modalwindow.classeCustom],
                this.estado.modalwindow.inserida.opcoesDefinidas.estilo.container
            );
            this.estado.modalwindow.classeCustom = this.estado.modalwindow.inserida.opcoesDefinidas.estilo.container;
        }

        /* Estado on */

        if (
            this.visiveisModal.classList.contains(
                novoEstado ? this.classes.modalwindow.estados.off : this.classes.modalwindow.estados.on
            )
        ) {
            this.visiveisModal.classList.replace(
                novoEstado ? this.classes.modalwindow.estados.off : this.classes.modalwindow.estados.on,
                novoEstado ? this.classes.modalwindow.estados.on : this.classes.modalwindow.estados.off
            )
        } else if (
            !this.visiveisModal.classList.contains(
                novoEstado ? this.classes.modalwindow.estados.on : this.classes.modalwindow.estados.off
            )
        ) {
            this.visiveisModal.classList.add(
                novoEstado ? this.classes.modalwindow.estados.on : this.classes.modalwindow.estados.off
            )
        }


        /****************************
            Toggle scroll na pÃ¡gina inteira, para nos focarmos no scroll da modal em si
        ****************************/
        
        TogglePageScroll(novoEstado);

        /*
            Toggle interatividade dos restantes elementos da pÃ¡gina
        */
        SetInert(
            this.outrosElementos,
            novoEstado
        );
    }

}

/*
    Elementos comuns
*/

function SubMenuHeader() {
    //
    const header = document.getElementById("ev-header-main")
    const subMenu = document.getElementById("ev-header-submenu");
    const subMenuBtn = document.getElementById("ev-header-botao-submenu");
    const subMenuBackdrop = document.querySelector(".ev-header-submenu-backdrop");
    const subMenuContainer = subMenu.querySelector(".ev-header-submenu-container");
    const subMenuFlyout = subMenu.querySelector(".ev-header-submenu-flyout");

    //
    const otherBodyElements = document.querySelectorAll(`body > *:not(dialog, script, noscript, iframe, #ev-header-main, #ev-header-submenu), .ev-header-logo-link, .ev-header .ev-botoes > *:not(#ev-header-botao-submenu)`);

    const propertyInlineName = '--main-header-height';

    function GetHeaderHeight() {
        subMenu.style.setProperty(propertyInlineName, `${header.offsetHeight}px`);
    }

    const resizeObs = EscolaVirtual.JSResizeObserverSupport ? new ResizeObserver(() => {
        GetHeaderHeight();
    }) : null;

    function Toggle() {
        EscolaVirtual.subMenuAberto = !EscolaVirtual.subMenuAberto;

        subMenuBtn.setAttribute("aria-expanded", EscolaVirtual.subMenuAberto);
        //TogglePageScroll(EscolaVirtual.subMenuAberto);
        SetInert(otherBodyElements, EscolaVirtual.subMenuAberto);
        SetInert([subMenu], !EscolaVirtual.subMenuAberto);

        if (subMenu.classList.contains("ev-header-submenu-initial")) {
            subMenu.classList.remove("ev-header-submenu-initial");
            if (EscolaVirtual.subMenuAberto) {
                //
                subMenu.classList.add("ev-header-submenu-open");

                subMenuFlyout.classList.add("anim26-preset-headerSubmenuFromTop", "anim26-duracao-750", "anim26-ease-drawer");
            }
        } else if (subMenu instanceof HTMLElement 
            && subMenuContainer instanceof HTMLElement 
            && subMenuFlyout instanceof HTMLElement) {
            /*
                Alterar classe de animaÃ§Ã£o conforme estado de abertura.
                Chamada de "offsetWidth" forÃ§a reflow, o que reinicia as animaÃ§Ãµes (tal como queremos)
                mas pode penalizar a performance mais Ã  frente.
            */

            subMenu.classList.remove(!EscolaVirtual.subMenuAberto ? "ev-header-submenu-open" : "ev-header-submenu-closed");
            void subMenu.offsetWidth;
            subMenu.classList.add(!EscolaVirtual.subMenuAberto ? "ev-header-submenu-closed" : "ev-header-submenu-open");

            subMenuFlyout.classList.remove(
                !EscolaVirtual.subMenuAberto 
                ? "anim26-preset-headerSubmenuFromTop"
                : "anim26-preset-headerSubmenuToTop");
            void subMenuFlyout.offsetWidth;
            subMenuFlyout.classList.add(
                !EscolaVirtual.subMenuAberto 
                ? "anim26-preset-headerSubmenuToTop"
                : "anim26-preset-headerSubmenuFromTop");
        }
        
        if (EscolaVirtual.subMenuAberto) {
            window.scrollTo(0, 0);
            subMenuBackdrop.classList.add("--ev-header-submenu-open");
            GetHeaderHeight();
            resizeObs.observe(header);
        } else {
            subMenuBackdrop.classList.remove("--ev-header-submenu-open");
            resizeObs.unobserve(header);
            subMenu.style.removeProperty(propertyInlineName);
        }
    }

    if (subMenu && subMenuBtn) {
        // Setup:
        subMenuBtn.setAttribute("aria-haspopup", "dialog");
        subMenuBtn.setAttribute("aria-controls", subMenu.id);
        subMenuBtn.setAttribute("aria-expanded", EscolaVirtual.subMenuAberto);
        const accordionGroup = new AccordionGroup(".ev-header-submenu-flyout", {onlyOneOpen: true});

        subMenuBtn.addEventListener("click", () => {
            Toggle();
            if (!EscolaVirtual.subMenuAberto) accordionGroup.closeAll(); // Fechar os accordions que estavam abertos
        });

        subMenuBackdrop.addEventListener("click", () => {
            Toggle();
            if (!EscolaVirtual.subMenuAberto) accordionGroup.closeAll(); // Fechar os accordions que estavam abertos
        });

        document.addEventListener("keyup", (e) => {
            if (e.key === "Escape" && EscolaVirtual.subMenuAberto) {
                Toggle();
                if (!EscolaVirtual.subMenuAberto) accordionGroup.closeAll(); // Fechar os accordions que estavam abertos
            }
        })

        ConsoleLog(`[EVPagina] Sub-menu do header disponÃ­vel`);
    }
}

function FooterMobile() {
    const accordions = new AccordionGroup(".footerDNav-mobile", {onlyOneOpen: true});
}

function SetBelowHeader(element) {
    if (element instanceof HTMLElement) {
        const header = document.querySelector("#ev-header-main");
        if (header) {
            const resizeObs = EscolaVirtual.JSResizeObserverSupport ? new ResizeObserver(() => {
                element.style.setProperty("--main-header-height", `${header.offsetHeight}px`);
            }) : null;
            resizeObs.observe(header);
        }
    }
}

function SubNav() {
    const detectedOldSubNav = document.querySelector(".SubNav");
    if (detectedOldSubNav) {
        SetBelowHeader(detectedOldSubNav);
    } else {
        const detectedSubNav = document.querySelector(".ev-loja-subnav");
        if (detectedSubNav) {
            SetBelowHeader(detectedSubNav);

            const subNavItems = [...document.querySelectorAll('.ev-loja-subnav-link')];
            const currentHref = window.location.href;
            subNavItems.forEach(anchor => {
                if (currentHref.includes(anchor.href)) {
                    // Substituir elemento "a" por "span":
                    const replacementEl = document.createElement("span");
                    replacementEl.id = anchor.id;
                    replacementEl.className = "ev-loja-subnav-link ev-loja-subnav-currentPage";
                    replacementEl.textContent = anchor.textContent;
                    anchor.replaceWith(replacementEl);
                }
            });

            new Navbar();
        }
    }
}

function CarouselTestemunhos(carouselSelector) {
    fetch('/themes/ev/assets/json/2026/Homepage_Testemunhos.json')
        .then(res => res.json())
        .then(testemunhos => {
        const carouselID = carouselSelector.replace("#", "");
        const container = document.querySelector(`${carouselSelector} .ev-carousel-items`);

        if (container !== null) {
            let currHeader = 4;

            testemunhos.forEach((testemunho, testemunhoIndex) => {
            function GetHeaderType() {
                switch (currHeader) {
                case 1:
                    return "ALU";
                case 2:
                    return "PROF";
                case 3:
                    return "INST";
                case 4:
                    return "EE";
                }
            }

            currHeader = currHeader === 4 ? 1 : currHeader + 1;

            const slide = document.createElement('div');
            slide.id = `ev-${carouselID}-entry${testemunhoIndex}`;
            slide.className = 'ev-carousel-entry ev-TestemunhosCarousels-entry';
            slide.innerHTML = `
            <figure>
                <img 
                class="header"
                src="themes/ev/assets/images/Global/2025/testemunho_banner_${GetHeaderType()}.svg"
                alt=""
                />
                <figcaption>
                    <div class="text">
                    <p>
                        <i>${testemunho.mensagem}</i>
                    </p>
                    ${testemunho.video === null || testemunho.video === undefined
                        ? ""
                        : `
                    <a class="viewVideo ev-botao ev-botao-bordered" 
                        href="${testemunho.video.url}"
                        target="_blank">
                        Ver vÃ­deo
                    </a>
                    `}
                    </div>
                    <div class="text">
                    <p class="title">${testemunho.nome}</p>
                    <p class="subtitle">
                        <b>${testemunho.tipo}</b> / ${testemunho.institut}
                    </p>
                    </div>
                </figcaption>
            </figure>
            `;

            container.appendChild(slide);
            });

            const carousel = new SwipeCarousel(carouselSelector, {
                controlType: "tabs",
                play: false,
                startWithIndex: 1,
                inertMode: "aria-hidden"
            }).init();
        }
        });

}

function AnimateWhenVisible() {
var $animation_elements = $('.anim26-whenVisible');
var $window = $(window);

function check_if_in_view() {
  var window_height = $window.height();
  var window_top_position = $window.scrollTop();
  var window_bottom_position = (window_top_position + window_height);
 
  $.each($animation_elements, function() {
    var $element = $(this);
    var element_height = $element.outerHeight();
    var element_top_position = $element.offset().top;
    var element_bottom_position = (element_top_position + element_height);
 
    //check to see if this current container is within viewport
    if ((element_bottom_position >= window_top_position) &&
        (element_top_position <= window_bottom_position)) {
        $element.removeClass('anim26-whenVisible');
      $element.addClass('anim26-visible');
    } /*else {
      $element.removeClass('in-view');
    }*/
  });
}
	
    check_if_in_view();

    $window.on('scroll resize', check_if_in_view);
    $window.trigger('scroll');
}

function BackToTop() {
    const backToTop = document.querySelector(".ev-backtotop");
    const header = document.querySelector(".ev-header");
    const headerLastBtn = header.querySelector("#ev-header-botao-submenu");
    let active = false;
    let keyboardNavigation = false;

    //
    if (backToTop && header && headerLastBtn) {
        function Set(to) {
            const activeArea = (window.innerHeight - header.scrollHeight) / 2;
            if (window.scrollY >= activeArea && to === true || window.scrollY >= activeArea && !active === true) {
                active = true;

                //
                backToTop.tabIndex = 0;
                backToTop.classList.add("ev-backtotop-active");
            } else if (window.scrollY >= activeArea && to === false || window.scrollY < activeArea && !active === false) {
                active = false;

                /*
                Se stayFocusable (ex: navegaÃ§Ã£o por teclado ativada),
                mantemos o "back to top" suscetÃ­vel ao focus.
                */
                backToTop.tabIndex = keyboardNavigation ? 0 : -1;

                //
                backToTop.classList.remove("ev-backtotop-active");
            }
        }

        // Estado inicial:
        Set();
        // DeteÃ§Ã£o de scroll:
        document.addEventListener("scroll", (event) => {
            if (!keyboardNavigation) Set();
        });
        // Premir o back to top:
        backToTop.addEventListener("click", () => {
            headerLastBtn.focus();
            window.scrollTo(0, 0);
        });

        // Ajustes focus:
        document.addEventListener("keydown", (e) => {
            if (e.key === "Tab" && !keyboardNavigation) {
                keyboardNavigation = true;

                /* NÃ£o permitir visibilidade sem focus mas manter
                tabindex ativo, de forma a que seja possÃ­vel fazer
                focus de todo. */
                Set(false);
            }
        });
        document.addEventListener("click", () => {
            if (keyboardNavigation) {
                console.log("Keyboard navigation");
                keyboardNavigation = false;
                Set("auto");
            }
        });
    }
}

/*
    FunÃ§Ã£o instanciadora
*/

class EVPagina {
    constructor(timestamp, actions) {
        if (EscolaVirtual.pagina) {
            throw new Error("[EVPagina] JÃ¡ existe uma instÃ¢ncia na variÃ¡vel global EscolaVirtual");
        } else {
            this.timestampAplicado = Number(timestamp);

            // VariÃ¡veis privadas
            let dialogos = [];

            // ExecuÃ§Ã£o:
            if (typeof actions !== "function") {
                throw new Error("[EVPagina] O segundo parÃ¢metro nÃ£o Ã© uma funÃ§Ã£o!");
            } else {
                if (this.timestampAplicado === NaN) {
                    ConsoleLog(`[EVPagina] NÃ£o foi possÃ­vel ler o timestamp do servidor. SerÃ¡ utilizado a data/hora local do dispositivo.`);
                    this.timestampAplicado = new Date().getTime();
                }
                ConsoleLog(`[EVPagina] Timestamp aplicado: ${this.timestampAplicado}`);

                // Elementos comuns a todas as pÃ¡ginas:
                SubMenuHeader();
                FooterMobile();
                AnimateWhenVisible();
                SubNav();
                BackToTop();

                // Correr cÃ³digo especÃ­fico para a pÃ¡gina onde a funÃ§Ã£o EVPagina
                // estÃ¡ a ser executado:
                actions(this.timestampAplicado);

                const paginaLoadEvento = new CustomEvent("EVPagina:load", { detail: this });
                document.dispatchEvent(paginaLoadEvento);

                this.adicionarDialogo = (dialogo) => {
                    if (!dialogo instanceof Dialog) {
                        throw new Error("[EVPagina] O segundo parÃ¢metro nÃ£o Ã© uma funÃ§Ã£o!");
                    } else {
                        dialogos.splice(0, 0, dialogo);
                        ConsoleLog(`[EVPagina] ${JSON.stringify(dialogos)}`);
                    }
                }

                document.addEventListener("keyup", (e) => {
                    if (e.key === "Escape") {
                        ConsoleLog(`[EVPagina] Esc premido`);
                        if (dialogos.length > 0) {
                            if (dialogos[0] instanceof Dialog) {
                                dialogos[0].close();
                                dialogos.slice(1);
                            } else {
                                ConsoleLog(`[EVPagina] NÃ£o Ã© diÃ¡logo`);
                            }
                        }
                    }
                });

                // Sinaliza que o JavaScript estÃ¡ a correr
                if (document.body.classList.contains("ev-nojs")) document.body.classList.replace("ev-nojs", "ev-js")
                else document.body.classList.add("ev-js");

                // Adicionar Ã  variÃ¡vel global
                EscolaVirtual.pagina = this;
            }
        }
    }
};
