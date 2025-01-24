---
layout: page
permalink: /publications/
title: Publications
description: The year indicates the time when the work is mostly finished. <br> * indicates equal contribution.
years: [2025,2024,2023,2022,2021]
nav: true
nav_order: 1
---
<!-- _pages/publications.md -->
<div class="publications">


{%- for y in page.years %}
  <h3 class="year">{{y}}</h3>
  {% bibliography -f papers -q @*[year={{y}}]* %}
{% endfor %}
