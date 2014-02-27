$(function() {

var width = $("#map").width(),
    height = 600,
    padding = 30;

// whole container
var svg = d3.select("#map")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

// layers
var backgroundLayer = svg.append("g")
        .classed("background", true),
    mapLayer = svg.append("g")
        .attr("transform", translate(0, padding))
        .classed("map", true),
    countryNameLayer = svg.append("g")
        .classed("country-name", true);
    labelsLayer = svg.append("g")
        .classed("labels", true),
    athletesLayer = svg.append("g")
        .classed("athletes", true),
    axesLayer = svg.append("g")
        .classed("axes", true);

var scaleAge, scaleAgeColor, scaleSport, sports;
var focusing = false,
    athletes = [],
    splitter = nullSplitter,
    medals = ["gold", "silver", "bronze"],
    medal_colors = {
        gold: "#ffd700",
        silver: "#c0c0c0",
        bronze: "#cd7f32",
        none: "#F5F5DC"
    },
    gender_colors = {
        male: "#4682b4",
        female: "#b44646"
    };

var projection = d3.geo.mercator()
    .scale(150)
    .translate([width / 2, height / 1.5]);

var path = d3.geo.path()
    .projection(projection);

var force = d3.layout.force()
    .nodes(athletes)
    .size([width, height])
    .theta(1.0)
    .gravity(0)
    .charge(-15)
    .friction(.925);

d3.selectAll(".control .split-btn")
    .on("click", function() {
        var button = d3.select(this);

        if (button.classed("split-none")) {
            splitter = nullSplitter;
        }
        else if (button.classed("split-medals")) {
            splitter = medalSplitter;
        }
        else if (button.classed("split-gender")) {
            splitter = genderSplitter;
        }
        else if (button.classed("split-age")) {
            splitter = ageSplitter;
        }
        else if (button.classed("split-sport")) {
            splitter = sportSplitter;
        }
        else {
            console.warn("invalid split?")
        }

        // start simulation
        simulation();
    });

backgroundLayer
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", height)
    .on("click", unfocus);

queue()
    .defer(d3.json, "data/countries.topo.json")
    .defer(d3.tsv, "data/cc.tsv")
    .defer(d3.json, "data/sports.json")
    .await(function(error, world, ccode, sports_) {
        var countries = topojson.feature(world, world.objects.countries).features;

        resetAgeAxes();

        scaleSport = d3.scale.category20()
            .domain(sports_.data.map(function(d) { return d.id; }));

        sports = _.object(sports_.data.map(function(d) { return d.id; }),
                          sports_.data.map(function(d) { return {name: d.name, type: d.type}; }));

        join_ccode(countries, ccode);

        mapLayer.selectAll("path")
            .data(countries)
            .enter()
            .append("path")
            .attr("d", path)
            .classed("country", true)
            .classed("inactive", function(d) { return !(d.properties.ccode && d.properties.ccode.id); })
            .on("click", focus)
            .on("mouseover", showAthletes)
            .on("mouseleave", hideAthletes);

        function join_ccode(countries, ccode) {
            var i, ccode_dict = {};

            for (i = 0; i < ccode.length; i++) {
                ccode_dict[ccode[i].a3] = ccode[i];
            }

            for (i = 0; i < countries.length; i++) {
                countries[i].properties.ccode = ccode_dict[countries[i].id]
            }
        }
});

function resetAgeAxes() {
    d3.json("data/athletes.json", function(error, athletes_) {
        var extent_age = d3.extent(athletes_.map(function(d) { return d.age; }));
        // numeric scale
        scaleAge = d3.scale.linear()
            .domain([extent_age[0] - 10, extent_age[1] + 10])
            .range([padding, width - padding]);

        // categorical scale
        scaleAgeColor = d3.scale.threshold()
            .domain([extent_age[0], 20, 30, 40, 50, extent_age[1] + 1])  // 6 thresholds
            .range(["gray", "red", "yellow", "green", "cyan", "purple", "gray"]);  // 6+1 colors
    });
}

function focus(d) {
    var xyz = get_xyz(d);

    mapLayer.transition()
        .attr("transform", "translate(" + projection.translate() + ")scale(" + xyz[2] + ")translate(-" + xyz[0] + ",-" + xyz[1] + ")")
        .selectAll("path")
        .style("stroke-width", function() {
            return 1.0 / xyz[2];
        });

    d3.select(this).classed("focused", true);
    focusing = true;
}

function unfocus() {
    d3.selectAll(".country.focused")
        .classed("focused", false);

    mapLayer.transition()
        .attr("transform", "scale(1,1)" + translate(0, padding))
        .selectAll("path")
        .style("stroke-width", null);

    focusing = false;
    hideAthletes();
}

function simulation() {
    removeAxisOrLabel();

    if (athletes.length === 0) {
        return;
    }

    athletesLayer.selectAll(".athlete")
        .data(athletes, function(d) { return d.id; })
        .data(athletes)
        .enter()
        .append("circle")
        .classed("athlete", true)
        .attr("r", 6)
        .attr("cx", function(d) { return d.x; })
        .attr("cy", function(d) { return d.y; })
        .on("mouseover", showAthleteInfo)  // works while focusing a country
        .on("mouseout", hideAthleteInfo)
        .call(force.drag);

    force
        .on("tick", generate_tick(splitter))
        .start();

    function generate_tick(splitter) {
        var axis,
            // flags for early displaying
            label_shown, axis_shown,
            s = splitter(),
            athlete = athletesLayer.selectAll(".athlete"),
            alpha_threshold = .03;

        if (s.fill) {
            athlete.style("fill", s.fill);
        }

        if (s.axis) {
            axis_shown = false;
            axis = s.axis();

            // remove existing handler
            force.on("tick.label", null);

            axesLayer.append("g")
                .classed("axis", true)
                .attr("transform", translate(0, height))
                .call(axis);

            force.on("tick.axis", function(e) {
                if (!axis_shown && e.alpha < alpha_threshold) {
                    var bottom = locate(d3.selectAll(".athlete"), "bottom"),
                        vertical_offset = 10;

                    if (!bottom) {
                        force.stop();
                        return;
                    }

                    // adjust axis
                    s.adjust(axis);

                    // update axis
                    axesLayer.selectAll(".axis")
                        .transition()
                        .duration(500)
                        .call(axis)
                        .attr("transform", translate(0, bottom[1] + vertical_offset));
                    axis_shown = true;
                }
            });
        }

        if (s.label) {
            label_shown = false;

            force.on("tick.label", function(e) {
                if (!label_shown && e.alpha < alpha_threshold) {
                    if (d3.select(".athlete").empty()) {
                        force.stop();
                        return;
                    }

                    labelsLayer.call(s.label);
                    label_shown = true;
                }
            });
        }

        // tick
        return function (e) {
            var k = .1 * e.alpha;

            athletes.forEach(s(k));
            athlete
                .attr("cx", function(d) { return d.x; })
                .attr("cy", function(d) { return d.y; });
        }
    }
}

function showAthletes(d) {
    var xyz = get_xyz(d);

    if (focusing) {
        return;
    }

    if (d.properties.ccode && d.properties.ccode.name) {
        countryNameLayer.append("text")
            .classed("country-name", true)
            .attr("x", 5)
            .attr("y", 25)
            .text(d.properties.ccode.name);
    }

    if (d.properties.ccode && d.properties.ccode.id) {
        d3.json("data/athletes/" + d.properties.ccode.id + ".json", function(athletes_) {
            // update athletes without reconstruction
            athletes.length = 0;
            athletes.push.apply(athletes, athletes_.data);
            simulation();
        });
    }

}

function hideAthletes() {
    if (!focusing) {
        athletes.length = 0;  // clear athletes
        countryNameLayer.select(".country-name").remove();
        athletesLayer.selectAll(".athlete").remove();
        removeAxisOrLabel();
    }
}

function removeAxisOrLabel() {
    axesLayer.selectAll(".axis").remove();
    labelsLayer.selectAll(".label").remove();
}

function showAthleteInfo(d) {
    if (focusing) {
        var xy = d3.mouse(this),
            infotip = d3.select("#infotip"),
            compiled = _.template($("#athlete_tip").html()),
            html = compiled(d);

        infotip
            .style("left", xy[0] + "px")
            .style("top", (xy[1] - 40) + "px")
            .html(html);

        infotip
            .classed("hidden", false);
    }
}

function hideAthleteInfo() {
    d3.select("#infotip")
        .classed("hidden", true);
}

function get_xyz(d) {
    var bounds = path.bounds(d),
        w_scale = (bounds[1][0] - bounds[0][0]) / width,
        h_scale = (bounds[1][1] - bounds[0][1]) / height,
        z = .96 / Math.max(w_scale, h_scale),
        x = (bounds[1][0] + bounds[0][0]) / 2,
        y = (bounds[1][1] + bounds[0][1]) / 2 + (height / z / 6);
    return [x, y, z];
}

function nullSplitter() {
    return function(k) {
        // tick
        return function(d) {
            d.x += (width / 2 - d.x) * k;
            d.y += (height / 2 - d.y) * k;
        };
    };
}

function genderSplitter() {
    var foci = {
        Male: [width / 2 + 100, height / 2],
        Female: [width / 2 - 100, height / 2]
    };

    s.fill = function(d) {
        switch (d.gender) {
            case "Male":
                return gender_colors.male;
            case "Female":
                return gender_colors.female;
            default:
                console.warn(d.gender);
                return "white";
        }
    }

    s.label = function(sele) {
        var vertical_offset = 25,
            males = d3.selectAll(".athlete")
                .filter(function(d) { return d.gender === "Male"; }),
            females = d3.selectAll(".athlete")
                .filter(function(d) { return d.gender === "Female"; }),
            male_bottom = locate(males, "bottom"),
            female_bottom = locate(females, "bottom");

        if (!male_bottom || !female_bottom) {
            force.stop();
            return;
        }

        sele.append("text")
            .classed("label", true)
            .attr("x", male_bottom[0])
            .attr("y", male_bottom[1] + vertical_offset)
            .text("Male");

        sele.append("text")
            .classed("label", true)
            .attr("x", female_bottom[0])
            .attr("y", female_bottom[1] + vertical_offset)
            .text("Female");
    };

    function s(k) {
        // tick
        return function(d) {
            var focus = foci[d.gender];
            d.x += (focus[0] - d.x) * k;
            d.y += (focus[1] - d.y) * k;
        };
    };

    return s;
}

function medalSplitter() {
    var offset = 125,
        foci = {
        gold: [width / 2, height / 2 - offset],
        silver: [width / 2 - offset, height / 2],
        bronze: [width / 2 + offset, height / 2],
        none: [width / 2, height / 2 + offset]
    };

    s.fill = function(d) {
        return medal_colors[medal(d)]
    };

    s.label = function(sele) {
        var i, label,
            colors = _.keys(medal_colors);

        for (i = 0; i < colors.length; i++) {
            // capitalization
            label = colors[i].charAt(0).toUpperCase() + colors[i].slice(1);

            sele.append("text")
                .classed("label", true)
                .attr("x", foci[colors[i]][0])
                .attr("y", foci[colors[i]][1])
                .text(label);
        }
    };

    function s(k) {
        // tick
        return function(d) {
            var focus = foci[medal(d)];
            d.x += (focus[0] - d.x) * k;
            d.y += (focus[1] - d.y) * k;
        };
    };

    function medal(d) {
        if (d.medals.gold > 0) {
            return "gold";
        }
        else if (d.medals.silver > 0) {
            return "silver";
        }
        else if (d.medals.bronze > 0) {
            return "bronze";
        }
        return "none";
    }

    return s;
}

function ageSplitter() {
    resetAgeAxes();

    s.fill = function(d) {
        return scaleAgeColor(d.age);
    };

    s.axis = function() {
        return d3.svg.axis()
            .scale(scaleAge)
            .orient("bottom");
    };

    s.adjust = function(axis) {
        var i, c, subset, domain = [], range = [],
            ages = d3.set(athletes.map(function(d) { return d.age; })).values();

        ages = ages.map(function(x) { return parseInt(x); }).sort();

        for (i = 0; i < ages.length; i++) {
            subset = d3.selectAll(".athlete")
                    .filter(function(d) { return d.age === ages[i]; });
            c = locate(subset, "center");
            domain.push(ages[i]);
            range.push(c[0]);
        }

        axis.scale()
            .domain(domain)
            .range(range);
    };

    function focus(age) {
        return [scaleAge(age), height / 2];
    }

    function s(k) {
        // tick
        return function(d) {
            var f = focus(d.age);
            d.x += (f[0] - d.x) * k;
            d.y += (f[1] - d.y) * k;
        };
    };

    return s;
}

function sportSplitter() {
    var i,
        center = [width / 2, height / 2],
        vectors = {},
        sport_ids = d3.set(athletes.map(function (d) { return d.sport.id; })).values(),
        n = sport_ids.length,
        r = 0.3,
        foci = {};

    if (n > 1) {
        for (i = 0; i < n; i++) {
            foci[sport_ids[i]] = [
                center[0] + width * Math.cos(2 * Math.PI * i / n) / 2 * r,
                center[1] + height * Math.sin(2 * Math.PI * i / n) / 2 * r
            ];
        }
    }
    else {
        foci[sport_ids[0]] = center;
    }

    s.fill = function(d) {
        return scaleSport(d.sport.id);
    };

    s.label = function(sele) {
        var i, label,
            diameter = 2;

        if (n === 1) {
            label = sports[sport_ids[0]].name;

            sele.append("text")
                .classed("label", true)
                .attr("x", center[0])
                .attr("y", center[1] + 30)
                .text(label);
        }
        else {
            for (i = 0; i < sport_ids.length; i++) {
                label = sports[sport_ids[i]].name;

                sele.append("text")
                    .classed("label", true)
                    .attr("x", (foci[sport_ids[i]][0] - center[0]) * diameter + center[0])
                    .attr("y", (foci[sport_ids[i]][1] - center[1]) * diameter + center[1])
                    .text(label);
            }
        }
    };

    function s(k) {
        // tick
        return function(d) {
            var focus = foci[d.sport.id];
            d.x += (focus[0] - d.x) * k;
            d.y += (focus[1] - d.y) * k;
        };
    };

    return s;
}

function locate(sele, location) {
    if (sele.empty()) {
        return null;
    }

    var cxs = sele.data()
            .map(function(d) { return d.x; }),
        cys = sele.data()
            .map(function(d) { return d.y; });

    if (location === "center") {
        return [d3.mean(cxs), d3.mean(cys)];
    }
    else if (location === "bottom") {
        return [d3.mean(cxs), d3.max(cys)];
    }

    return null;
}

function translate(x, y) {
    return "translate(" + x + ", " + y + ")";
}

function scale(x, y) {
    if (y === null) {
        y = x;
    }
    return "scale(" + x + ", " + y + ")";
}

});  // end $()
