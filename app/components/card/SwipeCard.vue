<script setup lang="ts">
import type { Dish } from '#shared/types/dish';

defineProps<{ dish: Dish }>();
</script>

<template>
    <div class="overflow-hidden rounded-[var(--radius-card)] bg-cream-card shadow-xl ring-1 ring-char/10">
        <CardDishArt class="mx-auto" :dish-id="dish.id" :name="dish.name" :emoji="dish.emoji" />
        <div class="px-5 py-4">
            <h3 class="font-display text-2xl font-bold leading-tight" data-testid="card-name">{{ dish.name }}</h3>
            <p class="mt-0.5 text-sm capitalize text-char/70">
                {{ dish.tags.cuisine }} · {{ dish.tags.vibe }}
            </p>
        </div>
    </div>
</template>
