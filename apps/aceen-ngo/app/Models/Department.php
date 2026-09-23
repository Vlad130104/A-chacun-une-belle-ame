<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Department extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'description', 'manager_id'];

    public function teamMembers(): HasMany
    {
        return $this->hasMany(TeamMember::class);
    }

    public function manager(): BelongsTo
    {
        return $this->belongsTo(TeamMember::class, 'manager_id');
    }
}
