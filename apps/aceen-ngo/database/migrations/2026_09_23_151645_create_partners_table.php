<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('partners', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->string('website')->nullable();
            $table->string('logo_path')->nullable();
            $table->string('partnership_type')->nullable();
            $table->string('country')->nullable();
            $table->string('sector')->nullable();
            $table->integer('established_since')->nullable();
            $table->enum('status', ['active', 'inactive', 'archived'])->default('active');
            $table->string('contact_person')->nullable();
            $table->string('contact_email')->nullable();
            $table->integer('order')->default(0);
            $table->timestamps();
            $table->index('slug');
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('partners');
    }
};
