// window.onbeforeunload = function () {
//   return window.scrollTo(0, 0);
// }

var $ = require("./lib/qsa");

// setup map
var aqi = require("./magic-map");

var slides = $(".sequence .slide").reverse();
var aiTriggers = $(".sequence .ai2html.double .trigger");
var activeAi = null;
var magicMap =  $("div.magic-map")[0];

var completion = 0;

var active = null;
var activateSlide = function(slide) {
  if (active == slide) return;
  if (active) {
    var exiting = active;
    active.classList.remove("active");
    active.classList.add("exiting");
    setTimeout(() => exiting.classList.remove("exiting"), 1000);
    //also remove magic map depending on slide type
    if(exiting.classList.contains("map-block") && !slide.classList.contains("map-block")) {
      magicMap.classList.remove("active");
      magicMap.classList.add("exiting");
      setTimeout(() => magicMap.classList.remove("exiting"), 1000);
  }
  }

  // lazy-load neighboring slides
  var neighbors = [-1, 0, 1, 2];
  var all = $(".sequence .slide");
  var index = all.indexOf(slide);
  neighbors.forEach(function(offset) {
    var neighbor = all[index + offset];
    if (!neighbor) return;
    var images = $("[data-src]", neighbor);
    images.forEach(function(img) {
      img.src = img.dataset.src;
      img.removeAttribute("data-src");
    })
  });

  slide.classList.add("active");
  slide.classList.remove("exiting");
  //also activate magic map depending on slide type
  if(slide.classList.contains("map-block")) {
    magicMap.classList.add("active");
    magicMap.classList.remove("exiting");
  }

  active = slide;
}

var switchAi = function(trigger) {
  if(activeAi == trigger) return;
  var parent =trigger.parentNode;
  //handle exiting
  if(activeAi && (activeAi.parentNode == trigger.parentNode)) { //only trigger if siblings
    var exiting = activeAi;
    var exitingState = exiting.getAttribute("state");
    //set classes on ai2html container so styles can trickle down
    parent.classList.remove(`active${exitingState}`);
    parent.classList.add(`exiting${exitingState}`);
    setTimeout(()=> parent.classList.remove(`exiting${exitingState}`), 1000);
  }
  //handle entering
  var enteringState = trigger.getAttribute("state");
  parent.classList.add(`active${enteringState}`);
  parent.classList.remove(`exiting${enteringState}`);
  activeAi = trigger;

}

var scrollSlides = function() {
  for (var i = 0; i < slides.length; i++) {
    var slide = slides[i];
    var bounds = slide.getBoundingClientRect();
    if (bounds.top < window.innerHeight * .9 && bounds.bottom > 0) {
      var complete = ((slides.length - i) / slides.length * 100) | 0;
      if (complete > completion) {
        completion = complete;
      }
      return activateSlide(slide);
    }
  }
}

var scrollAi = function() {
  for(var j = 0; j < aiTriggers.length; j++){
    var trigger = aiTriggers[j];
    var triggerBounds = trigger.getBoundingClientRect();
    if(triggerBounds.top < window.innerHeight * .9 && triggerBounds.bottom > 0) {
      return switchAi(trigger);
    }
  }
}

var onScroll = function() {
  scrollSlides();
  scrollAi();
}


document.body.classList.add("boot-complete");
window.addEventListener("scroll", onScroll);
onScroll();