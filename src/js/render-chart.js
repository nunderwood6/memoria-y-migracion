var d3 = require("d3/dist/d3.min");
var yearlyTotals = require("../../data/yearly-totals.json");
var makeTranslate = require("./lib/makeTranslate");
var fmtComma = s => s.toLocaleString().replace(/\.0+$/, "");

module.exports = function() {


  var labelColumn = "year";
  var valueColumn = "massacres";

  var margins = {
    top: 20,
    right: 10,
    bottom: 20,
    left: 30
  };

  var ticksY = 4;
  var ticksX = 5;
  var roundTicksFactor = 500;

  var container = document.querySelector("div.chart");

  var chartWidth = container.offsetWidth - margins.left - margins.right;
  var chartHeight = 60;
    // Math.ceil((container.offsetWidth * aspectHeight) / aspectWidth) -
    // margins.top -
    // margins.bottom;

  //clear for redraw
  var containerElement = d3.select(container);
  containerElement.select("svg").remove();

  var chartElement = containerElement
    .append("svg")
    .attr("width", chartWidth + margins.left + margins.right)
    .attr("height", chartHeight + margins.top + margins.bottom)
    .append("g")
    .attr("transform", `translate(${margins.left},${margins.top})`);

  var xScale = d3.scaleBand()
    .range([0, chartWidth])
    .round(true)
    .padding(0.1)
    .domain(yearlyTotals.map(d => d[labelColumn]));

    var floors = yearlyTotals.map(
      d => Math.floor(d[valueColumn] / roundTicksFactor) * roundTicksFactor
    );

    var min = Math.min(...floors);

    if (min > 0) {
      min = 0;
    }

    var ceilings = yearlyTotals.map(
      d => Math.ceil(d[valueColumn] / roundTicksFactor) * roundTicksFactor
    );

    var max = Math.max(...ceilings);

    var yScale = d3
      .scaleLog()
      .domain([0.7, 500])
      .range([chartHeight, 0]);

    // Create D3 axes.
    var xAxis = d3
      .axisBottom()
      .scale(xScale)
      .tickValues([1965,1970,1975,1980,1985,1990,1995]);

    var yAxis = d3
      .axisLeft()
      .scale(yScale)
      .tickValues([10,100,500])
      .tickFormat(function (d) {
            return fmtComma(d);
      })

    // Render axes to chart.
    chartElement
      .append("g")
      .attr("class", "x axis")
      .attr("aria-hidden", "true")
      .attr("transform", makeTranslate(0, chartHeight))
      .call(xAxis);

    chartElement
      .append("g")
      .attr("class", "y axis")
      .attr("aria-hidden", "true")
      .call(yAxis);

      //y axis grid
      var yAxisGrid = function() {
        return yAxis;
      };

      chartElement
        .append("g")
        .attr("class", "y grid")
        .call(
          yAxisGrid()
            .tickSize(-chartWidth, 0, 0)
            .tickFormat("")
        );


      // Render bars to chart.
      var bars = chartElement
        .append("g")
        .attr("class", "bars")
        .selectAll("rect")
        .data(yearlyTotals)
        .enter()
        .append("rect")
        .attr("x", d => xScale(d[labelColumn]))
        .attr("y", d => (d[valueColumn] <= 0 ? yScale(0.7) : yScale(d[valueColumn])))
        .attr("width", xScale.bandwidth())
        .attr("height", d =>
          d[valueColumn] <= 0
            ? 0
            : yScale(0.7) - yScale(d[valueColumn])
        )
        .attr("class", function(d) {
          return "bar"+d[labelColumn];
        });


          // add time indicator.
        var timeIndicator = chartElement
            .append("path")
                .attr("class", "timeIndicator")
                .attr("d", function(d){
                  return `M ${xScale(1965)} ${yScale(0.6)}H ${xScale(1995)+xScale.bandwidth()}`
                })
                .attr("stroke", "#fff")
                .attr("stroke-width", 2)
                .attr("fill", "none")
                .attr("stroke-dasharray", function(d){
                  return d3.select(this).node().getTotalLength();
                })
                .attr("stroke-dashoffset", function(d){
                  return d3.select(this).node().getTotalLength();
                });

};