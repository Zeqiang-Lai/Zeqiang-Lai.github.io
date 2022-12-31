---
layout: page
permalink: /publications/
title: Publications
description: publications by categories in reversed chronological order. 
years: [2022,2021,2020,2019,2018]
older: 2017
nav: true
nav_order: 1
---
<!-- _pages/publications.md -->
<div class="publications">

{%- for y in page.years %}
  <h2 class="year">{{y}}</h2>
  {% bibliography -f papers -q @*[year={{y}}]* %}
{% endfor %}

<h2 class="year">Older</h2>

{% bibliography -f papers -q @*[year<={{page.older}}]* %}
</div>
