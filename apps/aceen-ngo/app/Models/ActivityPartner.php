<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ActivityPartner extends Model
{
    use HasFactory;

    protected $table = 'activity_partners';
    protected $fillable = ['activity_id', 'partner_id'];
    public $timestamps = true;
}
