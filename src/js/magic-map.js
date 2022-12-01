var $ = require("./lib/qsa");
var d3 = require("d3/dist/d3.min");
var topojson = require("topojson");
var renderChart = require("./render-chart");
var enterView = require("enter-view");
var debounce = require("./lib/debounce");
var { isMobile, isTablet, isDesktop } = require("./lib/breakpoints");
var makeTranslate = require("./lib/makeTranslate");
var wrapText = require("./lib/wrapText");
var zoomingNow = false;

// load data
var focusBox = require("../../data/focus-extent.json");
var rasterBox = require("../../data/raster-extent.json");
var municipioTopo = require("../../data/municipios-topo.json");
var municipioData = topojson.feature(municipioTopo, municipioTopo.objects.municipios).features;
var homeData = require("../../data/home-points.json");
var massacreAnnotations = require("../../data/massacre-annotations.json");
var casesWithAnnotations = massacreAnnotations.map(d=>d.case);
var defendersData = require("../../data/defenders-data.json");

//load massacre data
var massacreData;
//adjust source for src/build
var massacreDataPath = "./assets/circle-positions.json";

var pathPrefix = ".";
if(location.hostname == "localhost") pathPrefix = ".";

d3.json(massacreDataPath).then(function(data){
        massacreData = data;
        drawMassacres();
        timelineElements = magicMap.selectAll(".timeline");



})


var mapContainer = $(".magic-map .inner")[0];
//get initial width and height
var w = mapContainer.offsetWidth;
var h = mapContainer.offsetHeight;

var margin = {top: 5, right: 5, bottom: 5, left: 5}

//guatemala-optimized projection
const centerLocation = {
	"longitude": -90.2299,
	"latitude": 15.7779
};

//albers centered on guatemala
albersGuate = d3.geoConicEqualArea()
              .parallels([14.8,16.8]) 
              .rotate([centerLocation["longitude"]*-1,0,0])
              .center([0,centerLocation["latitude"]])
              .fitExtent([[margin.left,margin.top],[w-margin.right,h-margin.bottom]], focusBox);

//path generator
pathGuate = d3.geoPath()
     .projection(albersGuate);

//store width of focus area to scale vectors
var computedBox = pathGuate.bounds(focusBox)
focusWidth = computedBox[1][0] - computedBox[0][0];
focusHeight = computedBox[1][1] - computedBox[0][1];

var svg = d3.select(mapContainer)
				.append("svg")
	              .attr("viewBox", `0 0 ${w} ${h}`)
	              .attr("preserveAspectRatio", "xMidYMid meet")
	              .attr("overflow", "visible");

var svgInner = svg.append("g")
	.attr("class", "inner");

//add focusBox as rectangle so we can calculate bbox for scaling later
var renderedBox = svgInner.append("rect")
          .attr("x", computedBox[0][0])
          .attr("y", computedBox[0][1])
          .attr("width", focusWidth)
          .attr("height", focusHeight)
          .attr("fill", "none")
          .attr("stroke", "#fff")
          .attr("stroke-width", 0.25);

//calculate raster bounds
var rasterBounds = pathGuate.bounds(rasterBox);

var rasterWidth = rasterBounds[1][0] - rasterBounds[0][0];
var rasterHeight = rasterBounds[1][1] - rasterBounds[0][1];
var rasterOrigin = [rasterBounds[0][0],rasterBounds[0][1]];

//append raster backgrounds
// all
svgInner.append("image")
        .attr("href", `${pathPrefix}/assets/img/dot_all.jpg`)
        .attr("xlink:href", `${pathPrefix}/assets/img/dot_all.jpg`)
        .attr("class", "allDot")
        .attr("x", rasterOrigin[0])
        .attr("y", rasterOrigin[1])
        .attr("width", rasterWidth + "px")
        .attr("height", rasterHeight + "px")
        .attr("opacity", "1");

// focus-only
var focusOnlyMap = svgInner.append("image")
        .attr("href", `${pathPrefix}/assets/img/focus-only.jpg`)
        .attr("xlink:href", `${pathPrefix}/assets/img/focus-only.jpg`)
        .attr("class", "focusOnlyMap")
        .attr("x", computedBox[0][0])
        .attr("y", computedBox[0][1])
        .attr("width", focusWidth)
        .attr("height", focusHeight)
        .attr("opacity", "1");

// indigenous
svgInner.append("image")
        .attr("href", `${pathPrefix}/assets/img/indigenous-only.jpg`)
        .attr("xlink:href", `${pathPrefix}/assets/img/indigenous-only.jpg`)
        .attr("class", "indigenousOnly")
        .attr("x", computedBox[0][0])
        .attr("y", computedBox[0][1])
        .attr("width", focusWidth)
        .attr("height", focusHeight)
        .attr("opacity", "0");

// binary
var binaryImg = svgInner.append("image")
        .attr("href", `${pathPrefix}/assets/img/binary.jpg`)
        .attr("xlink:href", `${pathPrefix}/assets/img/binary.jpg`)
        .attr("class", "binary")
        .attr("x", computedBox[0][0])
        .attr("y", computedBox[0][1])
        .attr("width", focusWidth)
        .attr("height", focusHeight)
        .attr("opacity", "0");

//draw municipios
var municipios = svgInner.append("g")
                  .selectAll(".municipio")
                  .data(municipioData)
                  .enter()
                  .append("path")
                      .attr("d", pathGuate)
                      .attr("class", "municipio")
                      .attr("id", function(d){
                        return "m" + d.properties["codigo_mun"];
                      })
                      .attr("fill", "none")
                      .style("display", "none");

var defendersGroup = svgInner.append("g")
                        .style("display", "none");

//draw defenders data
var defenderScale = d3.scaleSqrt()
                  .domain([0,5])
                  .range([0, 8]);

var defenders = defendersGroup.selectAll(".defenderCircles")
                    .data(defendersData)
                    .enter()
                    .append("g")
                      .attr("transform", function(d){
                        var codigo = d.codigo_municipio;
                        var municipio = svg.select(`#m${codigo}`);
                        var centroid = pathGuate.centroid(municipio.datum());
                        return makeTranslate(centroid[0],centroid[1]);
                      });
                      

var circles = defenders.append("circle")
    .attr("r", d=>defenderScale(d.total))
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.85)
    .attr("fill", "#000")
    .attr("fill-opacity", 0.8);

//add event listener for resize
d3.select(window).on('resize', resized);

function resized(){
  calculateZoomFactor();
  debounce(renderChart());
}

//draw massacres
var rScale = d3.scaleSqrt()
              .domain([0,400])
              .range([0, focusWidth/55]);

var startTime = "1965_0";

var currentData;
var massacreGroup;
var circleGroups;
var massacreCircles;

function drawMassacres(){
  var currentData = massacreData.municipios.filter(m => m.mama[startTime]);

  // viewBox from "calculateCirclePositions" was 0 0 678.359 709
  //need to adjust values to account for the old viewbox
  //cant set directly through viewbox since we will animate for zooming
  scaleFactor = h/653;

  massacreGroup = svg.append("g").attr("class", "timeline");

  circleGroups =  massacreGroup.selectAll(".circleGroups")
                             .attr("class", "circleGroups")
                             .data(currentData)
                             .enter()
                             .append("g")
                             .attr("transform", d => `translate(${d.mama[startTime].x*scaleFactor} ${d.mama[startTime].y*scaleFactor})`);


  massacreCircles = circleGroups.selectAll(".innerCircle")
                  .data(d=> d.mama[startTime].children)
                  .enter()
                  .append("circle")
                     .attr("class", "innerCircle")
                     .attr("caso", d=>d.caso)
                     .attr("cx", d=>d.x*scaleFactor)
                     .attr("cy", d=>d.y*scaleFactor)
                     .attr("r", 0)
                     .attr("r", d=>(d.r-0.1)*scaleFactor)
                     .attr("fill-opacity", 0.9)
                     .attr("fill", "#fff")
                     .attr("stroke", "#555")
                     .attr("stroke-width", 0.1);
}



renderChart();

//draw homes
var symbolSize = 3;
var labelPadding = 0.5;

var homePoints = svgInner.append("g")
              .attr("class", d => "homes")
              .selectAll("circle")
              .data(homeData.features)
              .enter()
              .append("rect")
                .attr("class", d => d.properties["name"])
                .attr("x", d=> albersGuate(d.geometry.coordinates)[0]-symbolSize/2)
                .attr("y", d=> albersGuate(d.geometry.coordinates)[1]-symbolSize/2)
                .attr("width", symbolSize)
                .attr("height", symbolSize)
                .attr("fill", "#fff")
                .attr("stroke", "#000")
                .attr("stroke-width", 0.25)
                .attr("opacity", 1);

//home labels
var homeLabels = svgInner.append("g")
            .attr("class", "homeLabels")
            .selectAll("text")
            .data(homeData.features)
            .enter()
            .append("g")
              .attr("class", d=> d.properties["name"] + " label")
              .attr("transform", function(d){
                if(d.properties.positionX == "right"){
                  var x = albersGuate(d.geometry.coordinates)[0]+(symbolSize+labelPadding);
                } else {
                  var x = albersGuate(d.geometry.coordinates)[0]-(symbolSize+labelPadding); 
                }
                if(d.properties.positionY == "top") var y = albersGuate(d.geometry.coordinates)[1]-(symbolSize+labelPadding);
                else var y = albersGuate(d.geometry.coordinates)[1]+(symbolSize+labelPadding);
                return `translate(${x},${y})`;
              })
              .html(function(d){
                if(d.properties.positionY == "top"){
                  return `<text><tspan x="0" dy="-0.5em">Pueblo de ${d.properties["name"]}</tspan>
                       <tspan x="0" dy="1em">${d.properties["town"]}</tspan></text>`;
                } else {
                  return `<text><tspan x="0" dy="-0.2em">${d.properties["town"]}</tspan>
                       <tspan x="0" dy="1em">Pueblo de ${d.properties["name"]}</tspan></text>`;
                }
              })
              .attr("dominant-baseline", d => (d.properties.positionY == "top") ? "auto" : "hanging")
              .attr("font-size", 11)
              .attr("text-anchor", function(d){
                  if(d.properties.positionX == "right"){
                    var anchor = "start";
                  } else{
                    var anchor = "end";
                  }
                  return anchor;
              })
              .attr("opacity", 0)
              .attr("fill", "#fff")
              .attr("font-weight", "bold")
              .attr("text-shadow", "text-shadow: -1px 0 black, 0 1px black, 1px 0 black, 0 -1px black;");

var zoomFactor;
//for resizing
var calculateZoomFactor = debounce(function (){
  var originalBoxWidth = renderedBox.node().getBBox().width;
  var clientBoxWidth = renderedBox.node().getBoundingClientRect().width;
  zoomFactor = originalBoxWidth/clientBoxWidth;
  resizeLabels();
},100);

function resizeLabels(){
  svg.selectAll(".label")
        .attr("font-size", function(d){
                  if(isMobile.matches) return d.textSize.mobile*zoomFactor +"px";
                  else return d.textSize.desktop*zoomFactor +"px";
        });


  svg.selectAll(".massacreAnnotation")
        .each(function(d){
          renderMassacreAnnotation(d3.select(this));
        });

          
}

function updateMassacres(currentData,timePeriod){

  //behaviour for updating groups
  var circleGroups = massacreGroup.selectAll(".circleGroups")
                        .data(currentData, d => d["codigo_mun"])
                        .join(
                          enter => enter.append("g")
                                    .attr("class", "circleGroups")
                                    .attr("transform", d => `translate(${d.mama[timePeriod].x*scaleFactor} ${d.mama[timePeriod].y*scaleFactor})`),
                          update => update.attr("transform", d => `translate(${d.mama[timePeriod].x*scaleFactor} ${d.mama[timePeriod].y*scaleFactor})`),
                          exit => exit.remove());

  var massacreCircles = circleGroups.selectAll(".innerChildren")
                      .data(d=> d.mama[timePeriod].children, d=> d.caso ? d.caso : ("c"+ d.caso_ilustrativo))
                         .join(enter => enter.append("g")
                              .attr("class", function(d){
                                var currentCase = d.caso ? ("c"+ d.caso) : ("c"+ d.caso_ilustrativo);
                                return "innerChildren " + currentCase;
                              })
                              .attr("transform", d => makeTranslate(d.x*scaleFactor,d.y*scaleFactor))
                                   .append("circle")
                                   .attr("r", d=>(d.r-0.1)*scaleFactor)
                                   .attr("fill-opacity", 0.8)
                                   .attr("fill", "#fff")
                                   .attr("stroke", "#555")
                                   .attr("stroke-width", function(d){
                                    //add massacre annotations
                                    var currentCase = d.caso ? ("c"+ d.caso) : ("c"+ d.caso_ilustrativo);
                                    //check if it has a massacre annotation, if so render
                                    var currentAnnotationIndex = casesWithAnnotations.indexOf(currentCase);
                                    if(currentAnnotationIndex != -1){
                                        //add annotation
                                        var label = massacreAnnotations[currentAnnotationIndex];
                                        //bind data
                                        var labelG = d3.select(this.parentNode)
                                                          .append("g")
                                                          .attr("opacity", 0)
                                                          .attr("class", `massacreAnnotation ${label.group}`)
                                                          .datum(label)

                                        renderMassacreAnnotation(labelG);

                                        //check for double
                                        if(label.double){


                                          var label2 = massacreAnnotations[currentAnnotationIndex+1];

                                          var labelG2 = d3.select(this.parentNode)
                                                          .append("g")
                                                          .attr("opacity", 0)
                                                          .attr("class", `massacreAnnotation ${label.group}`)
                                                          .datum(label2);
                                          renderMassacreAnnotation(labelG2);

                                          if(label2.animationIndex == animationIndex){
                                              if(!zoomingNow){
                                                 labelG2.transition("fade in annotation")
                                                    .duration(500)
                                                    .attr("opacity", 1);
                                              }
                                              
                                          }


                                        }
                                        if(label.animationIndex == animationIndex){
                                            if(!zoomingNow){
                                            labelG.transition("fade in annotation")
                                                        .duration(500)
                                                        .attr("opacity", 1);
                                            }
                                        }
                                        
                                    }

                                    return 0.1;
                                    }),
                          update => update.attr("transform", d => makeTranslate(d.x*scaleFactor,d.y*scaleFactor)),
                          exit => exit.remove());


}


//////////////////////////////////////////////////////////////////////
//////////////////Code for Discrete Animations///////////////////////////////
//////////////////////////////////////////////////////////////////////
var animationIndex = 0;

function addDiscreteListeners(){
  var stepSel = d3.selectAll(".discrete");

  enterView({
    selector: stepSel.nodes(),
    offset: 0,
    enter: el=> {
      const index = d3.select(el).attr('forward');
      updateMap[index]();
    },
    exit: el => {
      let index = d3.select(el).attr('backward');
      //check for multiple
      if(!index.includes(" ")){
         updateMap[index]();
      } else {
        var indexes = index.split(" ");
        for(var i of indexes){
          updateMap[i]();
        }
      }


      
    }
  });
}

var magicMap = d3.select("div.magic-map");
var timelineElements = magicMap.selectAll(".timeline");
//ai2html layers
var focusOnly = magicMap.selectAll(".focusOnly");
var indigenousOnly = magicMap.selectAll(".indigenousOnly");
var binary = magicMap.selectAll(".binary");
var defenders = magicMap.selectAll(".defenders");


var updateMap = {
  fadeFocus: function(){
    focusOnly.transition("fade in focus")
        .duration(500)
        .style("opacity", 1)

    focusOnly.selectAll("p").style("pointer-events", "auto");

    indigenousOnly.transition("fade out indigenous backward")
        .duration(500)
        .style("opacity", 0)

    indigenousOnly.selectAll("p").style("pointer-events", "none");

    homePoints.transition("fade in homes")
        .duration(500)
        .attr("opacity", 1);

  },
  fadeIndigenous: function(){
    //fade out homes
    homePoints.transition("fade out homes")
        .duration(500)
        .attr("opacity", 0);

    focusOnly.transition("fade out focus")
        .duration(500)
        .style("opacity", 0)

    focusOnly.selectAll("p").style("pointer-events", "none");

    binary.transition("fade out binary")
        .duration(500)
        .style("opacity", 0)

    binary.selectAll("p").style("pointer-events", "none");

    indigenousOnly.transition("fade in indigenous")
        .duration(500)
        .style("opacity", 1)

    indigenousOnly.selectAll("p").style("pointer-events", "auto");
  },
  fadeBinaryLabeled: function(){
    indigenousOnly.transition("fade out indigenous forward")
        .duration(500)
        .style("opacity", 0)

    indigenousOnly.selectAll("p").style("pointer-events", "none");

    binary.transition("fade in binary")
        .duration(500)
        .style("opacity", 1)

    binary.selectAll("p").style("pointer-events", "auto");

    homePoints.transition("fade in homes")
        .duration(500)
        .attr("opacity", 1);

  },
  fadeOutTimeline: function(){
    binary.style("opacity", 1);
    binary.selectAll("p").style("pointer-events", "auto");
    homePoints.attr("opacity", 1);

    timelineElements.style("opacity", 0);
  },
  fadeTimeline: function(){
    binary.transition("ensure clean timeline").duration(500).style("opacity", 0)
    binary.selectAll("p").style("pointer-events", "none");
    indigenousOnly.transition("ensure clean timeline").duration(500).style("opacity", 0)
    indigenousOnly.selectAll("p").style("pointer-events", "none");
    focusOnly.transition("ensure clean timeline").duration(500).style("opacity", 0)
    indigenousOnly.selectAll("p").style("pointer-events", "none");

    focusOnlyMap.style("opacity", 0);
    timelineElements.style("opacity", 1);
    homePoints.attr("opacity", 0);
  },
  zoomOutFull: function(){
    animationIndex = 0;
    svg.selectAll(".chorti,.Wilmer,.Juan,.chuj,.Felipe").transition("fade out east labels backward")
                     .duration(500)
                     .attr("opacity", 0)
                     .on("end", function(){
                        if(animationIndex == 0){
                          zoomingNow = true;
                          svg.transition("Zoom out full!").duration(1500).attr("viewBox", `0 0 ${w} ${h}`)
                                      .on("end", function(){
                                          zoomingNow = false;

                                          calculateZoomFactor();
                                      })
                        }
                      });
    
  },
  zoomChorti: function(){ 
    binary.transition("ensure clean timeline").duration(500).style("opacity", 0).style("pointer-events", "none");
    indigenousOnly.transition("ensure clean timeline").duration(500).style("opacity", 0).style("pointer-events", "none");
    focusOnly.transition("ensure clean timeline").duration(500).style("opacity", 0).style("pointer-events", "none");
    focusOnlyMap.style("opacity", 0);
    animationIndex = 1;

    //fade out labels
    svg.selectAll(".qeqchi,.Jakelin").transition("fade labels out chorti")
                                           .duration(500)
                                           .attr("opacity", 0);

    var w2 = .30*w,
    h2 = 0.36*h,
    left = 0.55*w,
    top= 0.51*h;

    zoomingNow = true;
    //zoom
    svg.transition("zoom east").duration(1500).attr("viewBox", `${left} ${top} ${w2} ${h2}`)
            .on("end", function(){
              //resized, need to calculate zoom
              zoomingNow = false;
              calculateZoomFactor();
              //check if still at current step before fading in east labels
              if(animationIndex == 1){

                //fade in east labels
                svg.selectAll(".chorti,.Wilmer,.Juan").transition("fade in east labels")
                                           .duration(500)
                                           .attr("opacity", 1);
              }
            });

  },
  zoomQeqchi: function(){
      animationIndex = 2;

      var w2 = .40*w,
      h2 = 0.36*h,
      left = 0.38*w,
      top= 0.35*h;

      //fade out chorti labels
      svg.selectAll(".chorti,.Wilmer,.Juan,.achi,.Carlos").transition("fade out labels qeqchi")
               .duration(500)
               .attr("opacity", 0);
      
      zoomingNow = true;
      //zoom to new location
      svg.transition("Zoom qeqchi").duration(1500).attr("viewBox", `${left} ${top} ${w2} ${h2}`)
                .on("end", function(){
                    zoomingNow = false;
                    calculateZoomFactor();
                    //fade in new labels
                    if(animationIndex == 2){
                        svg.selectAll(".Jakelin,.qeqchi").transition("fade in labels qeqchi")
                                .duration(500)
                                .attr("opacity", 1);
                    }

                });
                  
  },
  zoomAchi: function(){
    animationIndex = 3;

    var w2 = .30*w,
    h2 = 0.30*h,
    left = 0.28*w,
    top= 0.48*h;

    //fade out qeqchi labels
    svg.selectAll(".Jakelin,.qeqchi").transition("fade out labels achi")
             .duration(500)
             .attr("opacity", 0);

    zoomingNow = true;
    //zoom to new location
    svg.transition("Zoom achi").duration(1500).attr("viewBox", `${left} ${top} ${w2} ${h2}`)
              .on("end", function(){
                  zoomingNow = false;
                  calculateZoomFactor();
                  //fade in new labels
                  if(animationIndex == 3){
                      svg.selectAll(".Carlos,.achi").transition("fade in labels achi")
                              .duration(500)
                              .attr("opacity", 1);
                  }

              });

  },
  zoomChuj: function(){
    animationIndex = 4;

    var w2 = .30*w,
    h2 = 0.30*h,
    left = 0.10*w,
    top= 0.28*h;

    //fade out achi labels
    svg.selectAll(".Carlos,.achi").transition("fade out labels chuj")
             .duration(500)
             .attr("opacity", 0);

    zoomingNow = true;
    //zoom to new location
    svg.transition("Zoom chuj").duration(1500).attr("viewBox", `${left} ${top} ${w2} ${h2}`)
              .on("end", function(){
                  zoomingNow = false;
                  calculateZoomFactor();
                  //fade in new labels
                  if(animationIndex == 4){
                      svg.selectAll(".Felipe,.chuj").transition("fade in labels chuj")
                              .duration(500)
                              .attr("opacity", 1);
                  }

              });

  },
  fadeBinary: function(){
    //fade in binary
    binaryImg.transition("fadeInBinary")
          .duration(500)
          .style("opacity", 1)
  },
  fadeAll: function(){
    //fade out binary
    binaryImg.transition("fadeOutBinary")
          .duration(500)
          .style("opacity", 0)
  },
  fadeOutDefenders: function(){
    //show binary
    binaryImg.style("opacity", 1);
    //show all timeline elements
    timelineElements.style("opacity", 1);
    // hide defenders circles and html
    defendersGroup.style("display", "none");
    defenders.style("opacity", 0);


  },
  fadeDefenders: function(){
    //hide binary
    binaryImg.style("opacity", 0);
    //hide all timeline elements
    timelineElements.style("opacity", 0);
    //show defenders circles and html
    defendersGroup.style("display", "block");
    defenders.style("opacity", 1);
  }
}

function renderMassacreAnnotation(labelG){

  //clear previous
  labelG.html("");

  var label = labelG.datum();
  var parent = d3.select(labelG.node().parentNode);

  var circleBbox = parent.select("circle").node().getBBox();

  var leaderLine = labelG.append("path");
  //add rectangle underneath text
  var textRect = labelG.append("rect");

  //calculate text dimensions
  var textElement = labelG.append("text")
    .attr("class", "label wrapped")
    .datum(label)
    .attr("fill", "#000")
    .style("font-family", "Lora")
    // .style("font-weight", "bold")
    // .attr("font-style", d=> d["font-style"] ? d["font-style"] : "normal")
    .attr("font-style", "italic")
    .attr("font-size", function(d){
          if(isMobile.matches) return d.textSize.mobile*zoomFactor +"px";
          else return d.textSize.desktop*zoomFactor +"px";
    })
    .attr("dominant-baseline", "hanging")
    .text(label["text"])
    .attr("text-shadow", "text-shadow: -1px 0 black, 0 1px black, 1px 0 black, 0 -1px black;");



  var dWidth = isMobile.matches ? label["width"].mobile : label["width"].desktop;

  textElement.call(wrapText, dWidth, 12*zoomFactor);

  var textBbox = labelG.node().getBBox();
  var textW = textBbox["width"];
  var textH = textBbox["height"];

  //set x and y depending on where we want the text anchored
  labelG.attr("transform", function(d){
      var x,
      y;
      
      if(d.xAlign == "right"){
          x = circleBbox["width"]/2 + d.x;
      } else {
          x = d.x - circleBbox["width"]/2 - textW;
      }
      if(d.yAlign == "top"){
          y = circleBbox["height"]/2 + d.y;
      } else {
          y = d.y - circleBbox["height"]/2 - textH;
      }
      return makeTranslate(x,y);
  });


  var textPadding = 3;

  //add text rect
  textRect.attr("x", -textPadding)
          .attr("y",-textPadding)
          .attr("width", textW + textPadding*2)
          .attr("height", textH + textPadding*2)
          .attr("fill", "#fff")
          .attr("fill-opacity", 0.9)
          .attr("stroke", "none");

  //leader line dimensions
  leaderLine.attr("d", function(d){
                    if(d.xAlign == "right"){
                        var x0 = -circleBbox["width"]/2 - label.x;
                        var x1 = x0;
                        var x2 = -label.x/2;
                    } else {
                        var x0 = textW + circleBbox["width"]/2 -label.x;
                        var x1 = x0;
                        var x2 = textW - label.x/2;
                    }
                    if(d.yAlign == "top"){
                        var y0 = -circleBbox["height"]/2 -label.y;
                        var y1 = textH/2;
                        var y2 = y1;
                    } else {
                        var y0 = textH + circleBbox["height"]/2 -label.y;
                        var y1 = textH/2;
                        var y2 = y1;
                    }




                
                  return `M ${x0} ${y0}L ${x1} ${y1}L ${x2} ${y2}`;
                })
            .attr("stroke", "#fff")
            .attr("stroke-width", 0.4)
            .attr("fill", "none");

    //don't add if double
    if(!label["second"]){
        //add name and date
        labelG.append("text")
                .attr("x", 0)
                .attr("y", -textPadding - 1)
                .attr("font-size", function(d){
                      if(isMobile.matches) return d.textSize.mobile*zoomFactor +"px";
                      else return d.textSize.desktop*zoomFactor +"px";
                })
                .attr("font-weight", "bold")
                .attr("fill", "#fff")
                .attr("text-shadow", "text-shadow: -1px 0 black, 0 1px black, 1px 0 black, 0 -1px black;")
                .attr("dominant-baseline", "auto")
                .html(function(d){
                    return `<tspan x="0" dy="-1em" text-decoration="underline">Masacre de ${d.location}</tspan>
                            <tspan x="0" dy="1em">${d.date} — ${d.killed} ${d.victimType ? d.victimType : ""}muertos</tspan>`;
                });
    }




}

//////////////////////////////////////////////////////////////////////
//////////////////Code for Continuous Animations///////////////////////////////
//////////////////////////////////////////////////////////////////////

var timeDomain = [new Date(1965,0,1), new Date(1969,11,31)];
var timeDomain2 = [new Date(1969,11,31), new Date(1978,4,31)];
var timeDomain3 = [new Date(1978,4,31), new Date(1982,2,31)];
var timeDomain4 = [new Date(1982,2,31), new Date(1982,11,31)];
var timeDomain5 = [new Date(1983,11,31), new Date(1995,11,31)];
var overallTimeDomain = [new Date(1965,0,1), new Date(1995,11,31)];


var timeScale = d3.scaleLinear()
                    .domain(timeDomain)
                    .range([0,1]);

var timeScale2 = d3.scaleLinear()
                    .domain(timeDomain2)
                    .range([0,1]);

var timeScale3 = d3.scaleLinear()
                    .domain(timeDomain3)
                    .range([0,1]);

var timeScale4 = d3.scaleLinear()
                    .domain(timeDomain4)
                    .range([0,1])

var timeScale5 = d3.scaleLinear()
                    .domain(timeDomain5)
                    .range([0,1])

var timeScaleOverall = d3.scaleLinear()
                    .domain(overallTimeDomain)
                    .range([0,1]);


function fmtMonthYear(time){
  var dateObj = new Date(time);
  var month = dateObj.toLocaleString('es-ES', { month: 'long' });
  var year = dateObj.getFullYear();
  return month + " " + year;
}

function fmtMonthYearNum(time){
  var dateObj = new Date(time);
  var month = dateObj.getMonth();
  var year = dateObj.getFullYear();
  return year + "_" + month;
}

var currentDisplayTime = 1965;
var yearElement = d3.select("p.year");
var chartElement = d3.select(".chart-outer");
var bars = chartElement.selectAll(".bars rect");
var timeIndicator = chartElement.select(".timeIndicator");



function updateTime(){

  yearElement.text(currentDisplayTime);

  //update bars
  bars.attr("fill", function(d){
    var barYear = Number(d3.select(this).attr("class").substring(3));
    var currentYear = Number(currentDisplayTime.substring(currentDisplayTime.length - 4));
    if(barYear<currentYear){
      return "#ccc";
    } else if(barYear==currentYear){
      return "#fff";
    } else {
      return "#000";
    }
    });


    //update line
    timeIndicator.attr("stroke-dashoffset", function(d){
      var length = d3.select(this).node().getTotalLength();
      return length*(1-overallTimePercent);
    });
}

//////////////////////////////////////////////////////////////////////
//////////////////1)Smooth Animations, with RAF///////////////////////////////
//////////////////////////////////////////////////////////////////////
function addContinuousListeners(){

//observer for timeline
var observerOptions = {
  root: null,
  rootMargin: "0px",
  threshold: [0,0.1]
}

let observer = new IntersectionObserver(intersectionCallback, observerOptions);
var target = d3.select(".time1").node();
observer.observe(target);

var latestKnownTop = window.innerHeight;
var ticking = false;

function onScroll(){
  latestKnownTop = target.getBoundingClientRect().top;
  requestTick();
}

function requestTick(){
  if(!ticking){
      requestAnimationFrame(update);
  }
  ticking = true;
}
var accelAmmount = 0.9;

function update(){
    //reset tick to capture next scroll
  ticking = false;
  
  var currentTop = latestKnownTop;
  var percent = (window.innerHeight - currentTop)/ window.innerHeight;
  if(percent>1) percent = 1;
  if(percent<0) percent = 0;

  var newTime = timeScale.invert(percent);
  var newDisplayTime = fmtMonthYear(newTime);
  var timePeriod = fmtMonthYearNum(newTime);
  overallTimePercent = timeScaleOverall(newTime);


  if(newDisplayTime != currentDisplayTime){
    //update year text
    currentDisplayTime = newDisplayTime;
    updateTime();

    //update massacres
    var currentData = massacreData.municipios.filter(m => m.mama[timePeriod]);
    updateMassacres(currentData,timePeriod);

  }

}

var listening;

function intersectionCallback(entries, observer){
  if(entries[0].intersectionRatio>0){
    if(!listening) {
      window.addEventListener("scroll",onScroll);
    }
    listening = true;
  } else {
    window.removeEventListener("scroll", onScroll);
    listening = false;
  }
}

//duplicate
////////////////////////////////////////////

let observer2 = new IntersectionObserver(intersectionCallback2, observerOptions);
var target2 = d3.select(".time2").node();
observer2.observe(target2);


function onScroll2(){
  latestKnownTop2 = target2.getBoundingClientRect().top;
  requestTick2();
}

var ticking2 = false;

function requestTick2(){
  if(!ticking2){
      requestAnimationFrame(update2);
  }
  ticking2 = true;
}

function update2(){
  //reset tick to capture next scroll
  ticking2 = false;
  
  var currentTop = latestKnownTop2;
  var percent = (window.innerHeight - currentTop)/ window.innerHeight;
  if(percent>1) percent = 1;
  if(percent<0) percent = 0;

  var newTime = timeScale2.invert(percent);

  var newDisplayTime = fmtMonthYear(newTime);
  var timePeriod = fmtMonthYearNum(newTime);
  overallTimePercent = timeScaleOverall(newTime);


  if(newDisplayTime != currentDisplayTime){
    //update year text
    currentDisplayTime = newDisplayTime
    updateTime();
    //update massacres
    var currentData = massacreData.municipios.filter(m => m.mama[timePeriod]);
    updateMassacres(currentData,timePeriod);

  }

}

var listening2;

function intersectionCallback2(entries, observer){
  if(entries[0].intersectionRatio>0){
    if(!listening2) {
      window.addEventListener("scroll",onScroll2);
    }
    listening2 = true;
  } else {
    window.removeEventListener("scroll", onScroll2);
    listening2 = false;
  }
}


////////////////////////////////////////////

let observer3 = new IntersectionObserver(intersectionCallback3, observerOptions);
var target3 = d3.select(".time3").node();
observer3.observe(target3);


function onScroll3(){
  latestKnownTop3 = target3.getBoundingClientRect().top;
  requestTick3();
}

var ticking3 = false;

function requestTick3(){
  if(!ticking3){
      requestAnimationFrame(update3);
  }
  ticking3 = true;
}

function update3(){
    //reset tick to capture next scroll
  ticking3 = false;
  
  var currentTop = latestKnownTop3;
  var percent = (window.innerHeight - currentTop)/ window.innerHeight;
  if(percent>1) percent = 1;
  if(percent<0) percent = 0;

  var newTime = timeScale3.invert(percent);

  var newDisplayTime = fmtMonthYear(newTime);
  var timePeriod = fmtMonthYearNum(newTime);
  overallTimePercent = timeScaleOverall(newTime);


  if(newDisplayTime != currentDisplayTime){
    //update year text
    currentDisplayTime = newDisplayTime
    updateTime();
    //update massacres
    var currentData = massacreData.municipios.filter(m => m.mama[timePeriod]);
    updateMassacres(currentData,timePeriod);

  }

}

var listening3;

function intersectionCallback3(entries, observer){
  if(entries[0].intersectionRatio>0){
    if(!listening3) {
      window.addEventListener("scroll",onScroll3);
    }
    listening3 = true;
  } else {
    window.removeEventListener("scroll", onScroll3);
    listening3 = false;
  }
}

////////////////////////////////////////////

let observer4 = new IntersectionObserver(intersectionCallback4, observerOptions);
var target4 = d3.select(".time4").node();
observer4.observe(target4);


function onScroll4(){
  latestKnownTop4 = target4.getBoundingClientRect().top;
  requestTick4();
}

var ticking4 = false;

function requestTick4(){
  if(!ticking4){
      requestAnimationFrame(update4);
  }
  ticking4 = true;
}

function update4(){
    //reset tick to capture next scroll
  ticking4 = false;
  
  var currentTop = latestKnownTop4;
  var percent = (window.innerHeight - currentTop)/ window.innerHeight;
  if(percent>1) percent = 1;
  if(percent<0) percent = 0;

  var newTime = timeScale4.invert(percent);

  var newDisplayTime = fmtMonthYear(newTime);
  var timePeriod = fmtMonthYearNum(newTime);
  overallTimePercent = timeScaleOverall(newTime);


  if(newDisplayTime != currentDisplayTime){
    //update year text
    currentDisplayTime = newDisplayTime
    updateTime();
    //update massacres
    var currentData = massacreData.municipios.filter(m => m.mama[timePeriod]);
    updateMassacres(currentData,timePeriod);

  }

}

var listening4;

function intersectionCallback4(entries, observer){
  if(entries[0].intersectionRatio>0){
    if(!listening4) {
      window.addEventListener("scroll",onScroll4);
    }
    listening4 = true;
  } else {
    window.removeEventListener("scroll", onScroll4);
    listening4 = false;
  }
}

////////////////////////////////////////////

let observer5 = new IntersectionObserver(intersectionCallback5, observerOptions);
var target5 = d3.select(".time5").node();
observer5.observe(target5);


function onScroll5(){
  latestKnownTop5 = target5.getBoundingClientRect().top;
  requestTick5();
}

var ticking5 = false;

function requestTick5(){
  if(!ticking5){
      requestAnimationFrame(update5);
  }
  ticking5 = true;
}

function update5(){
    //reset tick to capture next scroll
  ticking5 = false;
  
  var currentTop = latestKnownTop5;
  var percent = (window.innerHeight - currentTop)/ window.innerHeight;
  if(percent>1) percent = 1;
  if(percent<0) percent = 0;

  var newTime = timeScale5.invert(percent);

  var newDisplayTime = fmtMonthYear(newTime);
  var timePeriod = fmtMonthYearNum(newTime);
  overallTimePercent = timeScaleOverall(newTime);


  if(newDisplayTime != currentDisplayTime){
    //update year text
    currentDisplayTime = newDisplayTime
    updateTime();
    //update massacres
    var currentData = massacreData.municipios.filter(m => m.mama[timePeriod]);
    updateMassacres(currentData,timePeriod);

  }

}

var listening5;

function intersectionCallback5(entries, observer){
  if(entries[0].intersectionRatio>0){
    if(!listening5) {
      window.addEventListener("scroll",onScroll5);
    }
    listening5 = true;
  } else {
    window.removeEventListener("scroll", onScroll5);
    listening5 = false;
  }
}

}

window.onload = function () { 
  addDiscreteListeners();
  addContinuousListeners();
}

