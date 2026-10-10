---
title: Making Sense of MoE
subtitle: Demystifying Mixture of Experts in Generative Models
date: "2026-10-09"
description: A walkthrough of MoE history, experts, routing, weighted combination, and load balancing, with the design choices behind them.
status: published
language: en
translation_key: moe
wide_tables: [1]
references:
  https://arxiv.org/abs/1701.06538:
    title: "Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer"
    authors: Shazeer et al.
    year: 2017
  https://arxiv.org/abs/2006.16668:
    title: "GShard: Scaling Giant Models with Conditional Computation and Automatic Sharding"
    authors: Lepikhin et al.
    year: 2020
  https://arxiv.org/abs/2101.03961:
    title: "Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity"
    authors: Fedus et al.
    year: 2021
  https://arxiv.org/abs/2103.16716:
    title: "BASE Layers: Simplifying Training of Large, Sparse Models"
    authors: Lewis et al.
    year: 2021
  https://arxiv.org/abs/2106.04426:
    title: "Hash Layers For Large Sparse Models"
    authors: Roller et al.
    year: 2021
  https://proceedings.mlr.press/v162/du22c.html:
    title: "GLaM: Efficient Scaling of Language Models with Mixture-of-Experts"
    authors: Du et al.
    year: 2022
  https://arxiv.org/abs/2201.05596:
    title: "DeepSpeed-MoE: Advancing Mixture-of-Experts Inference and Training to Power Next-Generation AI Scale"
    authors: Rajbhandari et al.
    year: 2022
  https://arxiv.org/abs/2202.01169:
    title: "Unified Scaling Laws for Routed Language Models"
    authors: Clark et al.
    year: 2022
  https://arxiv.org/abs/2202.08906:
    title: "ST-MoE: Designing Stable and Transferable Sparse Expert Models"
    authors: Zoph et al.
    year: 2022
  https://papers.nips.cc/paper_files/paper/2022/hash/2f00ecd787b432c1d36f3de9800728eb-Abstract-Conference.html:
    title: "Mixture-of-Experts with Expert Choice Routing"
    authors: Zhou et al.
    year: 2022
  https://arxiv.org/abs/2211.15841:
    title: "MegaBlocks: Efficient Sparse Training with Mixture-of-Experts"
    authors: Gale et al.
    year: 2022
  https://kexue.fm/archives/10699:
    title: "MoE环游记：1、从几何意义出发"
    authors: 苏剑林
    year: 2025
  https://kexue.fm/archives/10945:
    title: "MoE环游记：5、均匀分布的反思"
    authors: 苏剑林
    year: 2025
---

![Sparse MoE routing: the router selects two of four experts for one token and combines their outputs with a weighted sum.](assets/images/moe-routing.svg)

I've been exploring MoE recently and wanted to put together some notes on its development. Writing things down helps me connect the related work, and perhaps find a few new ideas along the way.

## A chronological view

When people mention MoE, the first papers that come to mind are often [Sparsely-Gated MoE (2017)](https://arxiv.org/abs/1701.06538), [GShard (2020)](https://arxiv.org/abs/2006.16668), and [Switch Transformer (2021)](https://arxiv.org/abs/2101.03961). Many later papers refer back to these three. But the idea goes all the way back to 1991:

> *Adaptive Mixtures of Local Experts*
>
> Robert A. Jacobs, Michael I. Jordan, Steven J. Nowlan, and Geoffrey E. Hinton

There's Hinton! Still, these early mixtures of experts did not use today's sparse routing that selects only the top K experts, so they differ from Sparsely-Gated MoE.

Sparsely-Gated MoE established a sparse expert selection and combination mechanism that became widely used. Switch Transformer simplified routing to Top-1 and used an auxiliary loss to encourage balanced expert loads.

Let's trace part of the development before ChatGPT's release. This covers several research directions, though there will inevitably be omissions. For context, GPT-3 appeared in May 2020, followed by GShard in June. By 2021, MoE research was extending beyond model size to routing, training stability, and execution efficiency.

| Date | Work | Main contribution |
| --- | --- | --- |
| **2021.01** | [Switch Transformer](https://arxiv.org/abs/2101.03961) | Simplified routing to **Top-1** and scaled sparse models to a trillion parameters. |
| **2021.03** | [BASE Layers](https://arxiv.org/abs/2103.16716) | Balanced token-to-expert assignment without auxiliary balancing losses. |
| **2021.06** | [Hash Layers](https://arxiv.org/abs/2106.04426) | Used fixed hash routing, competitive with learned routing in the reported experiments. |
| **2021.12** | [GLaM](https://proceedings.mlr.press/v162/du22c.html) | Scaled sparse language models to **1.2T parameters** with lower training and inference costs than GPT-3. |
| **2022.01** | [DeepSpeed-MoE](https://arxiv.org/abs/2201.05596) | Optimized MoE training and inference to reduce deployment cost. |
| **2022.02** | [Unified Scaling Laws for Routed Language Models](https://arxiv.org/abs/2202.01169) | Modeled how expert count, model size, and compute affect performance. |
| **2022.02** | [ST-MoE](https://arxiv.org/abs/2202.08906) | Introduced **router z-loss** and MoE fine-tuning practices for stability and transfer. |
| **2022.02** | [Expert Choice Routing](https://papers.nips.cc/paper_files/paper/2022/hash/2f00ecd787b432c1d36f3de9800728eb-Abstract-Conference.html) | Let **experts choose tokens**, balancing expert loads with variable experts per token. |
| **2022.11** | [MegaBlocks](https://arxiv.org/abs/2211.15841) | Used block-sparse kernels to train MoEs efficiently without dropping tokens. |

I find this timeline interesting: GLaM was already exploring sparse computation in large autoregressive language models, and subsequent work quickly advanced routing, stability, and GPU systems. Following these directions makes it easier to understand how modern MoE developed than simply ordering models by total parameter count.

## A first look at experts

In a typical Transformer MoE, we replace the original FFN with multiple experts and use a router to choose which ones to call for each token. Each token passes through only a subset of the experts, so the total parameter count can differ from the number of parameters activated for a single token.

Let's start with an easier case: splitting a dense FFN along its intermediate dimension. Suppose the input dimension is 1024 and the intermediate dimension is 4096. An FFN with an ordinary elementwise activation can be written as:

```text
Linear(1024, 4096) → σ → Linear(4096, 1024)
```

Split the intermediate dimension into four parts, each forming a smaller expert:

```text
Expert i: Linear(1024, 1024) → σ → Linear(1024, 1024)
```

Ignoring biases for now, split the first layer's weights by rows and the second layer's weights by the corresponding columns. Adding all the experts' outputs then recovers the original dense FFN:

$$
h_2 = W_2\sigma(W_1h_1) = \sum_{i=1}^{4} W_{2,i}\sigma(W_{1,i}h_1) = \sum_{i=1}^{4} E_i(h_1).
$$

This follows directly by expanding the block matrix multiplication. One detail matters here: **a sum is not a weighted average**. If the router assigns each of the four experts a uniform weight of 1/4, we need to multiply the output by 4 to recover the original dense FFN.

### What about SwiGLU?

SwiGLU adds a gate projection. To make the structure explicit:

```text
gate = Linear(1024, 4096)(x)
up   = Linear(1024, 4096)(x)
out  = Linear(4096, 1024)(SiLU(gate) * up)
```

As long as we split the gate and up projections together along the intermediate dimension, and split the output projection along the matching dimension, the result can still be written as a sum of expert outputs. Here, 4096 is simply a convenient intermediate dimension for illustrating the split.

This example helps explain the structure of an expert. A sparse MoE also makes dynamic routing decisions: once we activate only some of the experts, equivalence to the original dense FFN no longer follows automatically.

## How tokens find their experts

A router can be quite simple. Project each token's features to obtain a logit for each expert. The shapes are roughly:

```text
[Num Tokens, Hidden Size] → [Num Tokens, Num Experts]
```

Another way to view this is that each expert has a learnable vector, and the router measures how well the current token matches each one.

### Why can the router be so simple?

In an LLM, the router receives the token's hidden state at the current layer. This vector already contains contextual information processed by the preceding network. A linear router,

$$
s_i = w_i^\top x
$$

therefore uses each expert's learnable vector $w_i$ to assess its match with the current representation. The preceding network learns jointly as well, making the representations easier to route.

## Top-K: selection and combination

Once we have the logits, there are three separate questions:

1. **Selection**: Which experts take part in the computation? For a given token, both Softmax and Sigmoid preserve the ordering of the original logits. Without additional adjustments, we can therefore select the top K directly from the logits. Adding a selection bias for load balancing may change the result.
1. **Combination**: How much weight does each selected expert receive? We can convert logits into weights with Softmax or Sigmoid, and decide whether to renormalize within the selected set.
1. **Load balancing**: How do we avoid experts that are almost never activated or receive too many tokens? This affects both parameter utilization and the efficiency of computation and communication.

Selection usually means taking the top K scores, but some operations change the ordering. Examples include noisy routing in Sparsely-Gated MoE and the selection bias used for load balancing in DeepSeek-V3. Selection scores and final combination weights need not be the same quantity.

### How should we think about expert combination?

One intuitive view is to treat it as attention over experts: the router scores experts, then mixes their outputs by weight. Applying Softmax within the selected top K makes the weights sum to 1. Applying Softmax over all experts before selection, without renormalization, makes the output scale depend on the probability mass of the selected experts. Jianlin Su also offers a [geometric perspective](https://kexue.fm/archives/10699) worth reading alongside this view.

Whatever interpretation we use, implementation usually involves four choices:

1. Which gating function should we use, such as Sigmoid or Softmax?
2. Should we select the top K before or after applying the gating function?
3. Should we renormalize after Top-K selection?
4. Should we apply an additional scale factor after combination?

### Weights and normalization

A table helps here. Suppose there are N experts in total, and the selected set S has size K. Let $s_i$ be the logit for expert i, $a_i$ its score after activation, and $g_i$ its final combination weight.

| Score transformation | Normalize within selected set | Combination weight | Sum of selected weights |
| --- | --- | --- | --- |
| Softmax (all $N$) | No | $g_i = a_i$ | $\leq 1$ |
| Softmax (all $N$) | Yes | $g_i = \frac{a_i}{\sum_{j\in S} a_j}$ | $1$ |
| Sigmoid (elementwise) | No | $g_i = a_i$ | Not fixed |
| Sigmoid (elementwise) | Yes | $g_i = \frac{a_i}{\sum_{j\in S} a_j}$ | $1$ |

Applying Softmax over all N experts and then renormalizing within S is equivalent to applying Softmax directly to the K selected logits. The selected experts can be the same while the scale of their combination weights differs. Any additional scaling factor in the implementation needs to be taken into account as well.

Finally, the MoE layer takes a weighted sum of the selected experts' outputs:

$$
y = \alpha \sum_{i\in S} g_i E_i(x)
$$

Here, $\alpha$ is an optional scale factor, set to 1 when no additional scaling is used.

### How do we assess these choices?

Experiments are needed to determine which configuration works best. Still, two questions can guide the initial design.

**How should experts share their contributions?** Softmax creates competition through exponentiation and a shared denominator: increasing one expert's logit changes other experts' weights. Sigmoid scores each logit independently at first, although subsequent normalization still couples the experts.

**Do we want to control the scale of the MoE branch?** Softmax followed by Top-K without renormalization, or Sigmoid on the top K without normalization, lets the total weight vary with the router's predictions. Even when the weights sum to a constant, the actual output magnitude still depends on the experts' outputs.

If the model also has shared experts, we need to consider the relative scale of the shared and routed expert branches. Jianlin Su discusses related questions in [MoE Travel Notes, Part 5](https://kexue.fm/archives/10945). A scale factor provides a way to adjust this balance, but whether it is needed and how large it should be depend on the architecture.

### Saturation and gradient paths

Beyond the forward output, we also need to consider how the gating function responds to logits and how gradients flow backward.

Sigmoid saturates at both very large and very small logits, with its derivative approaching zero. Large positive logits also push different experts' scores close to 1. This can affect both score discrimination and the router's learning signal.

Top-1 deserves particular attention. If we select one expert and then apply Softmax only to that single logit, its weight is always 1. Since discrete Top-K selection is normally not differentiable, the task loss cannot train the router through this constant combination weight. Applying Softmax over all experts and retaining the selected expert's original probability preserves a gradient path through the gating weight; auxiliary losses can provide other training signals as well.

## Load balancing

The motivation for load balancing is fairly straightforward. Training the router described above imposes no explicit constraint on how many tokens each expert should receive. The allocation depends on training dynamics. We hope the model will use all its parameters to reduce the loss, but optimization does not guarantee that outcome.

Some experts may rarely be selected and receive too little training, while others may receive too many tokens and become computation or communication bottlenecks. Auxiliary losses, assignment constraints, or routing adjustments are therefore often introduced to encourage a more balanced load.

For now, this section simply sets out the problem. The implementation details and tradeoffs among different strategies deserve a separate post.

## Closing thoughts

Starting with the history, we have worked through experts, routers, expert selection, combination, and load balancing. When implementing an MoE, checking which experts are selected is only part of the work: the scale of the combination weights and the router's gradient paths also deserve attention. These small choices affect how the model allocates computation and learns.
