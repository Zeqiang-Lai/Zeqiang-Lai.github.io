---
layout: page
permalink: /publications/
title: Publications
description: publications by categories in reversed chronological order. 
years: [2023,2022,2021]
nav: true
nav_order: 1
---
<!-- _pages/publications.md -->
<div class="publications">

{%- for y in page.years %}
  <h3 class="year">{{y}}</h3>
  {% bibliography -f papers -q @*[year={{y}}]* %}
{% endfor %}
