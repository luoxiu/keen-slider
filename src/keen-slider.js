import './polyfills'
import { useKeenSlider } from './react-hook'

export { useKeenSlider }

function KeenSlider(initialContainer, initialOptions) {
  const events = []

  let container
  let touchControls
  let length
  let origin
  let slides
  let width
  let slidesPerView
  let spacing
  let resizeLastWidth
  let breakpointCurrent = null
  let optionsChanged = false
  let sliderCreated = false

  let trackCurrentIdx
  let trackPosition = 0
  let trackMeasurePoints = []
  let trackDirection
  let trackMeasureTimeout
  let trackSpeed
  let trackSlidePositions
  let trackProgress

  let options

  // touch/swipe helper
  let touchIndexStart
  let touchActive
  let touchIdentifier
  let touchLastX
  let touchLastClientX
  let touchLastClientY
  let touchMultiplicator
  let touchJustStarted

  // animation
  let reqId
  let startTime
  let moveDistance
  let moveDuration
  let moveEasing
  let moved
  let moveForceFinish
  let moveCallBack

  function eventAdd(element, event, handler, options = {}) {
    element.addEventListener(event, handler, options)
    events.push([element, event, handler])
  }

  function eventDrag(e) {
    if (
      !touchActive ||
      touchIdentifier !== eventGetIdentifier(e) ||
      !isTouchable()
    )
      return
    const x = eventGetX(e).x
    if (!eventIsSlide(e) && touchJustStarted) {
      return eventDragStop(e)
    }
    // if (!eventIsSlide(e)) {
    // make this optionally -> currently swiping is blocked when dragging is active
    // if (touchJustStarted) return eventDragStop(e)
    // if (e.cancelable) e.preventDefault()
    // touchLastX = x
    // return
    // }
    if (e.cancelable) e.preventDefault()
    touchJustStarted = false
    const touchDistance = touchLastX - x
    trackAdd(touchMultiplicator(touchDistance, pubfuncs))
    touchLastX = x
  }

  function eventDragStart(e) {
    if (touchActive || !isTouchable()) return
    touchActive = true
    touchJustStarted = true
    touchIdentifier = eventGetIdentifier(e)
    eventIsSlide(e)
    moveAnimateAbort()
    touchLastX = eventGetX(e).x
    touchIndexStart = trackCurrentIdx
    trackAdd(0)
    hook('dragStart')
  }

  function eventDragStop(e) {
    if (
      !touchActive ||
      touchIdentifier !== eventGetIdentifier(e, true) ||
      !isTouchable()
    )
      return
    touchActive = false
    moveWithSpeed()

    hook('dragEnd')
  }

  function eventGetChangedTouches(e) {
    return e.changedTouches
  }

  function eventGetIdentifier(e, changedTouches = false) {
    const touches = changedTouches
      ? eventGetChangedTouches(e)
      : eventGetTargetTouches(e)
    return !touches ? 'default' : touches[0] ? touches[0].identifier : 'error'
  }

  function eventGetTargetTouches(e) {
    return e.targetTouches
  }

  function eventGetX(e) {
    const touches = eventGetTargetTouches(e)
    return {
      x: isVertialSlider()
        ? !touches
          ? e.pageY
          : touches[0].screenY
        : !touches
        ? e.pageX
        : touches[0].screenX,
      timestamp: e.timeStamp,
    }
  }

  function eventIsSlide(e) {
    const touches = eventGetTargetTouches(e)
    if (!touches) return true
    const touch = touches[0]
    const x = isVertialSlider() ? touch.clientY : touch.clientX
    const y = isVertialSlider() ? touch.clientX : touch.clientY
    const isSlide =
      touchLastClientX !== undefined &&
      touchLastClientY !== undefined &&
      Math.abs(touchLastClientY - y) <= Math.abs(touchLastClientX - x)

    touchLastClientX = x
    touchLastClientY = y
    return isSlide
  }

  function eventWheel(e) {
    if (!isTouchable()) return
    if (touchActive) e.preventDefault()
  }

  function eventsAdd() {
    eventAdd(window, 'orientationchange', sliderResizeFix)
    eventAdd(window, 'resize', sliderResize)
    eventAdd(container, 'dragstart', function (e) {
      if (!isTouchable()) return
      e.preventDefault()
    })
    eventAdd(container, 'mousedown', eventDragStart)
    eventAdd(container, 'mousemove', eventDrag)
    eventAdd(container, 'mouseleave', eventDragStop)
    eventAdd(container, 'mouseup', eventDragStop)
    eventAdd(container, 'touchstart', eventDragStart)
    eventAdd(container, 'touchmove', eventDrag)
    eventAdd(container, 'touchend', eventDragStop)
    eventAdd(container, 'touchcancel', eventDragStop)
    eventAdd(window, 'wheel', eventWheel, {
      passive: !1,
    })
  }

  function eventsRemove() {
    events.forEach(function (event, idx) {
      event[0].removeEventListener(event[1], event[2])
    })
    events.length = 0
  }

  function hook(hook) {
    if (options[hook]) options[hook](pubfuncs)
  }

  function isCenterMode() {
    return options.centered
  }

  function isTouchable() {
    return touchControls !== undefined ? touchControls : options.controls
  }

  function isLoop() {
    return options.loop
  }

  function isrubberband() {
    return !options.loop && options.rubberband
  }

  function isVertialSlider() {
    return !!options.vertical
  }

  function moveAnimate() {
    reqId = window.requestAnimationFrame(moveAnimateUpdate)
  }

  function moveAnimateAbort() {
    if (reqId) {
      window.cancelAnimationFrame(reqId)
      reqId = null
    }
    startTime = null
  }

  function moveAnimateUpdate(timestamp) {
    if (!startTime) startTime = timestamp
    const duration = timestamp - startTime
    let add = moveCalcValue(duration)
    if (duration >= moveDuration) {
      trackAdd(moveDistance - moved, false)
      if (moveCallBack) return moveCallBack()
      hook('afterChange')
      return
    }

    const offset = trackCalculateOffset(add)
    // hard break in free or snap mode
    if (offset !== 0 && !isLoop() && !isrubberband() && !moveForceFinish) {
      trackAdd(add - offset, false)
      return
    }
    if (offset !== 0 && isrubberband() && !moveForceFinish) {
      return moveRubberband(Math.sign(offset))
    }
    moved += add
    trackAdd(add, false)
    moveAnimate()
  }

  function moveCalcValue(progress) {
    const value = moveDistance * moveEasing(progress / moveDuration) - moved
    return value
  }

  function moveWithSpeed() {
    hook('beforeChange')
    switch (options.mode) {
      case 'free':
        moveFree()
        break
      case 'free-snap':
        moveSnapFree()
        break
      case 'snap':
      default:
        moveSnapOne()
        break
    }
  }

  function moveSnapOne() {
    const startIndex =
      slidesPerView === 1 && trackDirection !== 0
        ? touchIndexStart
        : trackCurrentIdx
    moveToIdx(startIndex + Math.sign(trackDirection))
  }

  function moveToIdx(idx, forceFinish, duration = options.duration) {
    // forceFinish is used to ignore rubberband and other boundaries - because the rubberband uses this function too
    idx = trackClampIndex(idx)
    const easing = t => 1 + --t * t * t * t * t
    moveTo(trackGetIdxDistance(idx), duration, easing, forceFinish)
  }

  function moveFree() {
    if (trackSpeed === 0)
      return trackCalculateOffset(0) && !isLoop()
        ? moveToIdx(trackCurrentIdx)
        : false
    const friction = options.friction / Math.pow(Math.abs(trackSpeed), -0.5)
    const distance =
      (Math.pow(trackSpeed, 2) / friction) * Math.sign(trackSpeed)
    const duration = Math.abs(trackSpeed / friction) * 6
    const easing = function (t) {
      return 1 - Math.pow(1 - t, 5)
    }
    moveTo(distance, duration, easing)
  }

  function moveSnapFree() {
    if (trackSpeed === 0) return moveToIdx(trackCurrentIdx)
    const friction = options.friction / Math.pow(Math.abs(trackSpeed), -0.5)
    const distance =
      (Math.pow(trackSpeed, 2) / friction) * Math.sign(trackSpeed)
    const duration = Math.abs(trackSpeed / friction) * 6
    const easing = function (t) {
      return 1 - Math.pow(1 - t, 5)
    }
    const idx_trend = (trackPosition + distance) / (width / slidesPerView)
    const idx =
      trackDirection === -1 ? Math.floor(idx_trend) : Math.ceil(idx_trend)
    moveTo(idx * (width / slidesPerView) - trackPosition, duration, easing)
  }

  function moveRubberband() {
    moveAnimateAbort()
    const cb = () => {
      console.log(2)
      moveToIdx(trackCurrentIdx, true)
    }
    if (trackSpeed === 0) return cb()
    const friction = 0.05 / Math.pow(Math.abs(trackSpeed), -0.5)
    const distance =
      (Math.pow(trackSpeed, 2) / friction) * Math.sign(trackSpeed)
    const duration = Math.abs(trackSpeed / friction) * 2
    const easing = function (t) {
      return t * (2 - t)
    }
    moveTo(distance, duration, easing, true, cb)
  }

  function moveTo(distance, duration, easing, forceFinish, cb) {
    moveAnimateAbort()
    moveDistance = distance
    moved = 0
    moveDuration = duration
    moveEasing = easing
    moveForceFinish = forceFinish
    moveCallBack = cb
    startTime = null
    moveAnimate()
  }

  function sliderBind() {
    let _container = getElements(initialContainer)
    if (!_container.length) return
    container = _container[0]
    sliderResize()
    eventsAdd()
    hook('mounted')
  }

  function sliderCheckBreakpoint() {
    const breakpoints = initialOptions.breakpoints || []
    let lastValid
    for (let value in breakpoints) {
      if (window.matchMedia(value).matches) lastValid = value
    }
    if (lastValid === breakpointCurrent) return true
    breakpointCurrent = lastValid
    const _options = breakpointCurrent
      ? breakpoints[breakpointCurrent]
      : initialOptions
    if (_options.breakpoints && breakpointCurrent) delete _options.breakpoints
    options = { ...defaultOptions, ...initialOptions, ..._options }
    optionsChanged = true
    sliderRebind()
  }

  function sliderInit() {
    sliderCheckBreakpoint()
    sliderCreated = true
    hook('created')
  }

  function sliderRebind(new_options) {
    if (new_options) initialOptions = new_options
    sliderUnbind()
    sliderBind()
  }

  function sliderResize(force) {
    const windowWidth = window.innerWidth
    if (!sliderCheckBreakpoint() || (windowWidth === resizeLastWidth && !force))
      return
    resizeLastWidth = windowWidth
    const optionSlides = options.slides
    if (typeof optionSlides === 'number') {
      slides = null
      length = optionSlides
    } else {
      slides = getElements(optionSlides, container)
      length = slides ? slides.length : 0
    }
    const dragSpeed = options.dragSpeed
    touchMultiplicator =
      typeof dragSpeed === 'function' ? dragSpeed : val => val * dragSpeed
    width = isVertialSlider() ? container.offsetHeight : container.offsetWidth
    slidesPerView = clampValue(options.slidesPerView, 1, length - 1)
    spacing = clampValue(options.spacing, 0, width / (slidesPerView - 1) - 1)
    width += spacing
    origin = isCenterMode()
      ? (width / 2 - width / slidesPerView / 2) / width
      : 0
    slidesSetWidths()
    sliderSetHeight()
    trackSetPositionByIdx(
      !sliderCreated || (optionsChanged && options.resetSlide)
        ? options.initial
        : trackCurrentIdx
    )
    optionsChanged = false
  }

  function sliderResizeFix(force) {
    sliderResize()
    setTimeout(sliderResize, 500)
    setTimeout(sliderResize, 2000)
  }

  function sliderUnbind() {
    eventsRemove()
    slidesRemoveStyles()
    hook('destroyed')
  }

  function sliderSetHeight() {
    if (!slides || !options.autoHeight || isVertialSlider()) return
    const height = slides.reduce(
      (acc, slide) => Math.max(acc, slide.offsetHeight),
      0
    )
    container.style.height = height + 'px'
  }

  function slidesSetPositions() {
    if (!slides) return
    slides.forEach((slide, idx) => {
      const absoluteDistance = trackSlidePositions[idx].distance * width
      const x = isVertialSlider() ? 0 : absoluteDistance
      const y = isVertialSlider() ? absoluteDistance : 0
      slide.style.transform = `translate3d(${x}px, ${y}px, 0)`
    })
  }

  function slidesSetWidths() {
    if (!slides) return
    slides.forEach(slide => {
      const key = isVertialSlider() ? 'minHeight' : 'width'
      slide.style[key] = `calc(${100 / slidesPerView}% - ${
        (spacing / slidesPerView) * (slidesPerView - 1)
      }px)`
    })
  }

  function slidesRemoveStyles() {
    if (!slides) return
    slides.forEach(slide => {
      slide.style.removeProperty(isVertialSlider() ? 'minHeight' : 'width')
      slide.style.removeProperty('transform')
    })
  }

  function trackAdd(val, drag = true) {
    trackMeasure(val)
    if (drag) val = trackrubberband(val)
    trackPosition += val
    trackMove()
  }

  function trackCalculateOffset(add) {
    const trackLength =
      (width * (length - 1 * (isCenterMode() ? 1 : slidesPerView))) /
      slidesPerView
    const position = trackPosition + add
    return position > trackLength
      ? position - trackLength
      : position < 0
      ? position
      : 0
  }

  function trackClampIndex(idx) {
    return !isLoop()
      ? clampValue(
          idx,
          0,
          length - 1 - (isCenterMode() ? 0 : slidesPerView - 1)
        )
      : idx
  }

  function trackGetDetails() {
    return {
      direction: trackDirection,
      progressTrack: Math.abs(trackProgress),
      progressSlides: (Math.abs(trackProgress) * length) / (length - 1),
      positions: trackSlidePositions,
      position: trackPosition,
      speed: trackSpeed,
      relativeSlide: ((trackCurrentIdx % length) + length) % length,
      absoluteSlide: trackCurrentIdx,
      size: length,
      widthOrHeight: width,
    }
  }

  function trackGetIdxDistance(idx) {
    return -(-((width / slidesPerView) * idx) + trackPosition)
  }

  function trackMeasure(val) {
    clearTimeout(trackMeasureTimeout)
    const direction = Math.sign(val)
    if (direction !== trackDirection) trackMeasurePoints = []
    trackDirection = direction
    trackMeasurePoints.push({
      distance: val,
      time: Date.now(),
    })
    trackMeasureTimeout = setTimeout(() => {
      trackMeasurePoints = []
      trackSpeed = 0
    }, 50)
    trackMeasurePoints = trackMeasurePoints.slice(-6)
    if (trackMeasurePoints.length <= 1 || trackDirection === 0)
      return (trackSpeed = 0)

    const distance = trackMeasurePoints
      .slice(0, -1)
      .reduce((acc, next) => acc + next.distance, 0)
    const end = trackMeasurePoints[trackMeasurePoints.length - 1].time
    const start = trackMeasurePoints[0].time
    trackSpeed = distance / (end - start)
  }

  // todo - option for not calculating slides that are not in sight
  function trackMove() {
    trackProgress = isLoop()
      ? (trackPosition % ((width * length) / slidesPerView)) /
        ((width * length) / slidesPerView)
      : trackPosition / ((width * length) / slidesPerView)

    trackSetCurrentIdx()
    const slidePositions = []
    for (let idx = 0; idx < length; idx++) {
      let distance =
        (((1 / length) * idx -
          (trackProgress < 0 && isLoop() ? trackProgress + 1 : trackProgress)) *
          length) /
          slidesPerView +
        origin
      if (isLoop())
        distance +=
          distance > (length - 1) / slidesPerView
            ? -(length / slidesPerView)
            : distance < -(length / slidesPerView) + 1
            ? length / slidesPerView
            : 0

      const slideWidth = 1 / slidesPerView
      const left = distance + slideWidth
      const portion =
        left < slideWidth
          ? left / slideWidth
          : left > 1
          ? 1 - ((left - 1) * slidesPerView) / 1
          : 1
      slidePositions.push({
        portion: portion < 0 || portion > 1 ? 0 : portion,
        distance,
      })
      trackSlidePositions = slidePositions
    }
    slidesSetPositions()
    hook('move')
  }

  function trackrubberband(add) {
    if (isLoop()) return add
    const offset = trackCalculateOffset(add)
    if (!isrubberband()) return add - offset
    if (offset === 0) return add
    const easing = t => (1 - Math.abs(t)) * (1 - Math.abs(t))
    return add * easing(offset / width)
  }

  function trackSetCurrentIdx() {
    const new_idx = Math.round(trackPosition / (width / slidesPerView))
    if (new_idx === trackCurrentIdx) return
    trackCurrentIdx = new_idx
    hook('slideChanged')
  }

  function trackSetPositionByIdx(idx) {
    hook('beforeChange')
    trackAdd(trackGetIdxDistance(idx))
    hook('afterChange')
  }

  const defaultOptions = {
    autoHeight: true,
    centered: false,
    breakpoints: null,
    controls: true,
    dragSpeed: 1,
    friction: 0.0025,
    loop: false,
    initial: 0,
    duration: 500,
    slides: '.keen-slider__slide',
    vertical: false,
    resetSlide: false,
    slidesPerView: 1,
    spacing: 0,
    mode: 'snap',
    rubberband: true,
  }

  const pubfuncs = {
    controls: active => {
      touchControls = active
    },
    destroy: sliderUnbind,
    refresh: sliderRebind,
    next() {
      moveToIdx(trackCurrentIdx + 1)
    },
    prev() {
      moveToIdx(trackCurrentIdx - 1)
    },
    moveToSlide(idx, duration) {
      moveToIdx(idx, false, duration)
    },
    resize() {
      sliderResize(true)
    },
    details() {
      return trackGetDetails()
    },
  }

  sliderInit()

  return pubfuncs
}

export default KeenSlider

// helper functions

function convertToArray(nodeList) {
  return Array.prototype.slice.call(nodeList)
}

function getElements(element, wrapper = document) {
  return typeof element === 'function'
    ? convertToArray(element())
    : typeof element === 'string'
    ? convertToArray(wrapper.querySelectorAll(element))
    : element instanceof HTMLElement !== false
    ? [element]
    : element instanceof NodeList !== false
    ? element
    : []
}

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max)
}