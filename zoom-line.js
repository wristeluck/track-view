var w = document.getElementById('chart').clientWidth;
var h = document.getElementById('chart').clientHeight;
console.log([w, h]);
var margin = {top: 10, right: 10, bottom: 100, left: 40},
margin2 = {top: 330, right: 10, bottom: 20, left: 40},
width = 1000 - margin.left - margin.right,
height = 400 - margin.top - margin.bottom,
height2 = 400 - margin2.top - margin2.bottom;

var parseDate = d3.time.format("%b %Y").parse;

var x = d3.time.scale().range([0, width]),
x2 = d3.time.scale().range([0, width]),
y = d3.scale.linear().range([height, 0]),
y2 = d3.scale.linear().range([height2, 0]);

var xAxis = d3.svg.axis().scale(x).orient("bottom"),
xAxis2 = d3.svg.axis().scale(x2).orient("bottom"),
yAxis = d3.svg.axis().scale(y).orient("left");

var brush = d3.svg.brush()
    .x(x2)
    .on("brush", brushed);

var area = d3.svg.line()
//    .interpolate("monotone")
    .x(function(d) { return x(d.gps.timestamp); })
//    .y0(height)
    .y(function(d) { return y(d.gps.speed); });

var area2 = d3.svg.area()
    .interpolate("monotone")
    .x(function(d) { return x2(d.gps.timestamp); })
    .y0(height2)
    .y1(function(d) { return y2(d.gps.speed); });

var svg = d3.select("#chart").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

svg.append("defs").append("clipPath")
    .attr("id", "clip")
    .append("rect")
    .attr("width", width)
    .attr("height", height);

var focus = svg.append("g")
    .attr("class", "focus")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

var context = svg.append("g")
    .attr("class", "context")
    .attr("transform", "translate(" + margin2.left + "," + margin2.top + ")");

function process(data) {
    x.domain(d3.extent(data.map(function(d) { return d.gps.timestamp; })));
    y.domain([0, d3.max(data.map(function(d) { return d.gps.speed; }))]);
    x2.domain(x.domain());
    y2.domain(y.domain());

    focus.append("path")
        .datum(data)
        .attr("class", "redline")
        .attr("d", area);

    focus.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis);

    focus.append("g")
        .attr("class", "y axis")
        .call(yAxis);

    context.append("path")
        .datum(data)
        .attr("class", "area")
        .attr("d", area2);

    context.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height2 + ")")
        .call(xAxis2);

    context.append("g")
        .attr("class", "x brush")
        .call(brush)
        .selectAll("rect")
        .attr("y", -6)
        .attr("height", height2 + 7);
}

function brushed() {
    x.domain(brush.empty() ? x2.domain() : brush.extent());
    focus.select(".redline").attr("d", area);
    focus.select(".x.axis").call(xAxis);
    updateMapSelection(brush.extent());
}


///////////////////////////

$.ajax({
    url: "sample/small-11.log",
    type: "GET",
    dataType: 'binary',
    responseType:'arraybuffer',
    processData: false,
    success: parse_log
});

function parse_log(data) {
    var parser = create_parser(data);
    //    console.log(data);
    var catalog = parser.parse('all');
    var current_offset = catalog.catalog.first & 0xFF;
    var file_size = catalog.catalog.first & 0xFFFFFF00;
    console.log(catalog);
    console.log("current offset = " + current_offset);
    console.log("file size = " + file_size);
    for(i = 0; i <= current_offset; i++) {
	console.log(catalog.catalog.offsets[i].toString(16));
    }

    var block = parser.parseBlock();
    console.log(block);
    console.log("tell() = " + parser.tell().toString(16));

    parser.seek(parseInt("c400", 16));
    block = parser.parseBlock();
    console.log(block);
    console.log("tell() = " + parser.tell().toString(16));

    track = block.filter(function (el) {
        return el !== null && el.hasOwnProperty("gps");
    });

    console.log(track);
    

    var trackCoordinates = track.map(function(el, index, arr) {
        return new google.maps.LatLng(el.gps.latitude, el.gps.longitude);
    });

    var trackPath = new google.maps.Polyline({
        path: trackCoordinates,
        geodesic: true,
        strokeColor: '#FF0000',
        strokeOpacity: 1.0,
        strokeWeight: 2
    });

    trackPath.setMap(map);

    trackSelection =  new google.maps.Polyline({
        path: [],
        geodesic: true,
        strokeColor: '#0000FF',
        strokeOpacity: 1.0,
        strokeWeight: 3
    });

    trackSelection.setMap(map);

    google.maps.event.addListener(trackPath, 'click', function(h) {
        var latlng=h.latLng;
        var needle = {
            minDistance: 9999999999, //silly high
            index: -1,
            latlng: null
        };
        trackPath.getPath().forEach(function(routePoint, index){
            var dist = google.maps.geometry.spherical.computeDistanceBetween(latlng, routePoint);
            if (dist < needle.minDistance){
                needle.minDistance = dist;
                needle.index = index;
                needle.latlng = routePoint;
            }
        });
        // The closest point in the polyline
        console.log("Closest index: " + needle.index);

        // The clicked point on the polyline
        var closest = track[needle.index];
        console.log(closest);

    });

    process(track);
}

//////// maps

function initialize() {
  var mapOptions = {
    zoom: 12,
    center: new google.maps.LatLng(51.0, -1.0)
//    mapTypeId: google.maps.MapTypeId.TERRAIN
  };

  map = new google.maps.Map(document.getElementById('map-canvas'),
      mapOptions);
}

google.maps.event.addDomListener(window, 'load', initialize);

function updateMapSelection(extent) {
  var selected = track.filter(function (el) {
      return (el.gps.timestamp >= extent[0] && el.gps.timestamp <= extent[1]);
  });

  var path = selected.map(function(el, index, arr) {
    return new google.maps.LatLng(el.gps.latitude, el.gps.longitude);
  });
  trackSelection.setPath(path);
}
